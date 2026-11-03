"use server";

import fs from "node:fs";
import path from "node:path";
import { BlenderError, findBlender, renderProduct, renderSilhouettes, type SilhouetteView } from "@/lib/blender";
import { CAD_KEYFRAME_MODEL, buildInteractionPrompt, clampCadParams, buildPlatePrompt, greenMaskPrompt, harmonizePrompt, removeProductPrompt, type CadParams } from "@/lib/cad-camera";
import { composeProduct, fitMask, greenMask, occluderMask, productHoleImage, protectProduct, replaceProduct } from "@/lib/cad-composite";
import sharp from "sharp";
import { deleteRequest, estimate, HiggsfieldError, submit, uploadFile, waitFor } from "@/lib/higgsfield";
import { addKeyframe, toKeyframeView, type KeyframeView } from "@/lib/keyframe-repo";
import { cadDir, getProductModel, modelPath } from "@/lib/model-repo";
import { findLocalProject, getProduct } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";

type Result<T> = { error?: string; result?: T };
const fail = (e: unknown) => ({ error: e instanceof HiggsfieldError || e instanceof BlenderError ? e.message : e instanceof Error ? e.message : "处理失败" });

const PLATE_MODEL = "marketing-studio/image/flare";

const plateInput = (prompt: string, aspect: string, imageUrls: string[] = []) => ({
  prompt,
  image_urls: imageUrls,
  quality: "xhigh",
  resolution: "2k",
  aspect_ratio: aspect === "9:16" ? "9:16" : aspect === "16:9" ? "16:9" : "21:9",
  enhance_prompt: false,
});

async function runFlare(input: Record<string, unknown>): Promise<Buffer> {
  const req = await submit(PLATE_MODEL, input);
  try {
    const done = await waitFor(req.request_id);
    const url = done.images?.[0]?.url;
    if (!url) throw new HiggsfieldError("没有返回图片");
    const res = await fetch(url);
    if (!res.ok) throw new HiggsfieldError(`下载图片失败（HTTP ${res.status}）`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    await deleteRequest(req.request_id).catch(() => undefined);
  }
}

function modelOrThrow(projectId: string) {
  if (!findLocalProject(projectId)) throw new Error("项目不存在或为示例项目");
  const m = getProductModel(projectId);
  if (!m || !fs.existsSync(modelPath(m))) throw new BlenderError("请先在产品页上传带材质的 GLB 模型");
  return m;
}

/** 产品页：用默认英雄机位渲染一张，检查模型、材质与 Blender 是否正常 */
export async function testRenderAction(projectId: string): Promise<Result<{ url: string; seconds: number }>> {
  try {
    const m = modelOrThrow(projectId);
    const t0 = Date.now();
    const out = path.join(cadDir(projectId), "test-hero.png");
    await renderProduct({
      glb: modelPath(m),
      out,
      width: 1400,
      height: 900,
      azimuth_deg: -38,
      elevation_deg: 8,
      lens_mm: 50,
      key_dir_deg: -60,
      key_elev_deg: 35,
      key_kelvin: 5400,
      samples: 96,
    });
    return { result: { url: `/api/cad/${projectId}?f=test-hero.png&t=${Date.now()}`, seconds: Math.round((Date.now() - t0) / 1000) } };
  } catch (e) {
    return fail(e);
  }
}

export async function cadStatusAction(projectId: string): Promise<{ blender: boolean; model: boolean }> {
  return { blender: Boolean(findBlender()), model: Boolean(getProductModel(projectId)) };
}

export async function estimateCadKeyframeAction(projectId: string, harmonize: boolean): Promise<Result<{ usd: number; note: string }>> {
  try {
    modelOrThrow(projectId);
    const board = getStoryboard(projectId);
    const { usd, description } = await estimate(PLATE_MODEL, plateInput("estimate", board?.visualSpec.aspectRatio ?? "2.39:1"));
    return { result: { usd: Number.isFinite(usd) ? usd * (harmonize ? 2 : 1) : NaN, note: description.slice(0, 300) } };
  } catch (e) {
    return fail(e);
  }
}

export interface CadKeyframeResult {
  keyframe: KeyframeView;
  /** 中间文件：标签 → URL */
  files: [string, string][];
  aiDrift: number | null;
  fit?: { iou: number; coverage: number };
  renderSeconds: number;
}

/** 接触镜头：AI 出完整画面（以 CAD 渲染为参考）→ 绿色遮罩定位 → CAD 对齐替换 */
async function interactionKeyframe(projectId: string, shotId: string, p: CadParams, basePrompt: string, dir: string, glb: string, aspect: string, productNote: string): Promise<Omit<CadKeyframeResult, "keyframe"> & { bytes: Buffer; prompt: string; usd: number }> {
  const product = getProduct(projectId);
  const productName = product?.name ?? "";
  const t0 = Date.now();
  const renderAt = (azimuth: number, roll: number, name: string) =>
    renderProduct({
      glb,
      out: path.join(dir, name),
      width: 1600,
      height: 1600,
      azimuth_deg: azimuth,
      elevation_deg: p.elevationDeg,
      lens_mm: p.lensMm,
      roll_deg: roll,
      key_dir_deg: p.keyDirDeg,
      key_elev_deg: p.keyElevDeg,
      key_kelvin: p.keyKelvin,
      exposure: p.exposure,
      samples: 128,
    });
  let render = await renderAt(p.azimuthDeg, p.rollDeg, "product.png");
  let renderSeconds = Math.round((Date.now() - t0) / 1000);
  // 参考图：渲染铺在中性灰底上
  const refPng = await sharp(render.image).flatten({ background: { r: 128, g: 128, b: 128 } }).png().toBuffer();
  fs.writeFileSync(path.join(dir, "product-ref.png"), refPng);
  const refUrl = await uploadFile(refPng, "image/png");
  const prompt = buildInteractionPrompt(basePrompt, productName, product?.bible ?? [], productNote);
  const unit = await estimate(PLATE_MODEL, plateInput(prompt, aspect, [refUrl])).then((r) => r.usd).catch(() => NaN);
  const ai = await runFlare(plateInput(prompt, aspect, [refUrl]));
  fs.writeFileSync(path.join(dir, "ai.png"), ai);
  const aiUrl = await uploadFile(ai, "image/png");
  const green = await runFlare(plateInput(greenMaskPrompt(productName), aspect, [aiUrl]));
  fs.writeFileSync(path.join(dir, "green.png"), green);
  const meta = await sharp(ai).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  const gm = await greenMask(green, W, H);
  const occ = await occluderMask(green, W, H);

  // AI 只看到一块绿色空洞（看不到任何产品细节），把它补成背景；人和手保留
  const holeImg = await productHoleImage(ai, gm, occ, W, H);
  fs.writeFileSync(path.join(dir, "hole.png"), holeImg);
  const holeUrl = await uploadFile(holeImg, "image/png");
  const clean = await runFlare(plateInput(removeProductPrompt(), aspect, [holeUrl]));
  fs.writeFileSync(path.join(dir, "clean.png"), clean);

  // 自动匹配视角：按 AI 画的车头朝向（红色座椅）定方位角正负，批量渲染剪影比对 IoU，再在最优解附近细化
  const sign = gm.facing === "right" ? 1 : gm.facing === "left" ? -1 : Math.sign(p.azimuthDeg) || -1;
  const searchViews = async (views: SilhouetteView[], tag: string) => {
    const files = await renderSilhouettes(glb, path.join(dir, `sil-${tag}`), p.lensMm, views);
    let best = { view: views[0], iou: -1 };
    for (let i = 0; i < files.length; i++) {
      const fit = await fitMask(files[i], gm, W, H).catch(() => null);
      if (fit && fit.iou > best.iou) best = { view: views[i], iou: fit.iou };
    }
    return best;
  };
  const t1 = Date.now();
  const coarse: SilhouetteView[] = [];
  for (let a = 10; a <= 80; a += 10) for (const e of [p.elevationDeg - 10, p.elevationDeg, p.elevationDeg + 10]) for (const r of new Set([p.rollDeg * sign * -1, 0])) coarse.push({ azimuth_deg: sign * a, elevation_deg: e, roll_deg: r });
  const b1 = await searchViews(coarse, "coarse");
  const fine: SilhouetteView[] = [];
  for (const da of [-5, 0, 5]) for (const de of [-5, 0, 5]) for (const dr of [-6, 0, 6]) fine.push({ azimuth_deg: b1.view.azimuth_deg + da, elevation_deg: b1.view.elevation_deg + de, roll_deg: b1.view.roll_deg + dr });
  const b2 = await searchViews(fine, "fine");
  const view = b2.iou > b1.iou ? b2.view : b1.view;
  const searchSeconds = Math.round((Date.now() - t1) / 1000);

  // 按匹配到的视角正式渲染并对齐替换
  const backlit = /逆光|背光|黄昏|夕阳|backlit|backlight|sunset|golden hour/i.test(basePrompt);
  const t2 = Date.now();
  render = await renderProduct({
    glb,
    out: path.join(dir, "product.png"),
    width: 1600,
    height: 1600,
    azimuth_deg: view.azimuth_deg,
    elevation_deg: view.elevation_deg,
    lens_mm: p.lensMm,
    roll_deg: view.roll_deg,
    // 用去车后的背景当环境光；主光放在相机对面低角度，模拟逆光太阳，轮廓光由 Blender 真实计算
    env_image: path.join(dir, "clean.png"),
    env_strength: p.envStrength,
    key_dir_deg: backlit ? view.azimuth_deg + 180 : p.keyDirDeg,
    key_elev_deg: backlit ? 12 : p.keyElevDeg,
    key_kelvin: p.keyKelvin,
    key_strength: backlit ? 6 : 3,
    key_mix: backlit ? 0.9 : 0.4,
    exposure: p.exposure,
    samples: 128,
  });
  renderSeconds += Math.round((Date.now() - t2) / 1000);
  const fit = await fitMask(render.mask, gm, W, H);
  // 完整贴 CAD：一个像素不少，只在蓝色遮挡处露出人；曝光 / 色温系数按原 AI 画面里的车算
  const rep = await replaceProduct(clean, render.image, render.mask, fit, gm, W, H, p.protect === "tone" ? "grade" : p.protect, { occluder: occ, gradeRef: ai });
  const calls = 3;
  fs.writeFileSync(path.join(dir, "final.png"), rep.final);
  let occPx = 0;
  for (const v of occ) if (v > 128) occPx++;
  fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...fit, view, aiFacing: gm.facing, coarseIou: b1.iou, fineIou: b2.iou, occluderPixels: occPx, gain: rep.gain, searchSeconds }));
  const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
  const files: [string, string][] = [["AI 完整画面", f("ai.png")], ["标注（绿=车 红=座椅 蓝=遮挡）", f("green.png")], ["去车后的背景", f("clean.png")]];
  return {
    bytes: rep.final,
    prompt: `${prompt}\n\n[CAD interaction] ${JSON.stringify({ ...p, view, fit })}`,
    usd: Number.isFinite(unit) ? unit * calls : 0,
    files,
    aiDrift: null,
    fit: { iou: Math.round(fit.iou * 100) / 100, coverage: Math.round(fit.coverage * 100) / 100 },
    renderSeconds,
  };
}

/**
 * CAD 保护合成关键帧：
 * 1) Blender 按机位渲染产品（透明背景 + 接触阴影 + 产品遮罩）
 * 2) Flare 生成不含产品的空场景
 * 3) 本机合成（sharp）
 * 4) 可选：Flare 融合阴影 / 色温，然后用遮罩把原始产品像素贴回 → 产品零变形
 */
export async function generateCadKeyframeAction(projectId: string, shotId: string, raw: CadParams, basePrompt: string): Promise<Result<CadKeyframeResult>> {
  try {
    const m = modelOrThrow(projectId);
    const board = getStoryboard(projectId);
    const shot = board?.episodes.flatMap((e) => e.shots).find((s) => s.id === shotId);
    if (!board || !shot) throw new Error("镜头不存在，请先保存分镜");
    if (!/^[a-z0-9-]+$/i.test(shotId)) throw new Error("镜头 ID 无效");
    const p = clampCadParams(raw);
    const productName = getProduct(projectId)?.name ?? "";
    const dir = path.join(cadDir(projectId), shotId.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });

    if (p.interaction) {
      const r = await interactionKeyframe(projectId, shotId, p, basePrompt, dir, modelPath(m), board.visualSpec.aspectRatio, shot.productNote);
      const k = addKeyframe({ projectId, shotId, bytes: r.bytes, model: CAD_KEYFRAME_MODEL, prompt: r.prompt, usd: r.usd });
      if (!k) throw new Error("保存关键帧失败");
      return { result: { keyframe: toKeyframeView(k), files: r.files, aiDrift: r.aiDrift, fit: r.fit, renderSeconds: r.renderSeconds } };
    }

    // 1) 空场景（可复用上次的，便于只调产品光线 / 位置）
    const platePrompt = buildPlatePrompt(basePrompt, p, productName);
    const plateFile = path.join(dir, "plate.png");
    const reused = p.reusePlate && fs.existsSync(plateFile);
    const unit = reused ? 0 : await estimate(PLATE_MODEL, plateInput(platePrompt, board.visualSpec.aspectRatio)).then((r) => r.usd).catch(() => NaN);
    const plate = reused ? fs.readFileSync(plateFile) : await runFlare(plateInput(platePrompt, board.visualSpec.aspectRatio));
    if (!reused) fs.writeFileSync(plateFile, plate);

    // 2) 用空场景当环境光渲染产品（含接触阴影、遮罩、地面倒影层）
    const t0 = Date.now();
    const render = await renderProduct({
      glb: modelPath(m),
      out: path.join(dir, "product.png"),
      width: 1600,
      height: 1600,
      azimuth_deg: p.azimuthDeg,
      elevation_deg: p.elevationDeg,
      lens_mm: p.lensMm,
      roll_deg: p.rollDeg,
      key_dir_deg: p.keyDirDeg,
      key_elev_deg: p.keyElevDeg,
      key_kelvin: p.keyKelvin,
      env_image: plateFile,
      env_strength: p.envStrength,
      exposure: p.exposure,
      floor_roughness: p.floorRoughness,
      samples: 128,
    });
    const renderSeconds = Math.round((Date.now() - t0) / 1000);

    // 3) 本机合成：倒影层（screen）→ 产品层
    const comp = await composeProduct(plate, render.image, render.mask, p, { file: render.reflection, strength: p.reflection });
    fs.writeFileSync(path.join(dir, "composite.png"), comp.composite);
    fs.writeFileSync(path.join(dir, "mask.png"), comp.mask);

    let finalBytes = comp.composite;
    let aiDrift: number | null = null;
    let harmonizedUrl: string | undefined;
    if (p.harmonize) {
      const url = await uploadFile(comp.composite, "image/png");
      const harmonized = await runFlare(plateInput(harmonizePrompt(productName), board.visualSpec.aspectRatio, [url]));
      fs.writeFileSync(path.join(dir, "harmonized.png"), harmonized);
      const prot = await protectProduct(harmonized, comp.composite, comp.mask, comp.width, comp.height, p.protect);
      finalBytes = prot.final;
      aiDrift = Math.round(prot.aiDrift * 10) / 10;
      harmonizedUrl = `/api/cad/${projectId}?f=${shotId.toLowerCase()}/harmonized.png`;
    }
    fs.writeFileSync(path.join(dir, "final.png"), finalBytes);

    const usd = (Number.isFinite(unit) ? unit : 0) + (p.harmonize && Number.isFinite(unit) ? unit : 0);
    const k = addKeyframe({
      projectId,
      shotId,
      bytes: finalBytes,
      model: CAD_KEYFRAME_MODEL,
      prompt: `${platePrompt}\n\n[CAD] ${JSON.stringify(p)}`,
      usd,
    });
    if (!k) throw new Error("保存关键帧失败");
    const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
    const files: [string, string][] = [["产品渲染", f("product.png")], ["空场景", f("plate.png")], ["直接合成", f("composite.png")]];
    if (harmonizedUrl) files.push(["AI 融合（贴回前）", harmonizedUrl]);
    return { result: { keyframe: toKeyframeView(k), files, aiDrift, renderSeconds } };
  } catch (e) {
    return fail(e);
  }
}
