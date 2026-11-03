"use server";

import fs from "node:fs";
import path from "node:path";
import { BlenderError, findBlender, renderProduct, renderSilhouettes, type SilhouetteView } from "@/lib/blender";
import { CAD_KEYFRAME_MODEL, buildInteractionPrompt, clampCadParams, buildPlatePrompt, greenMaskPrompt, harmonizePrompt, removeProductPrompt, type CadParams } from "@/lib/cad-camera";
import { anchorFit, composeProduct, contactShadow, estimateSun, fitMask, greenMask, groundRow, handFixMask,
  handPoints, lockScene, contactQa, relightLoss, occluderMask, placedMask, productHoleImage, protectProduct, relightTransfer, replaceProduct, snapToGround } from "@/lib/cad-composite";
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
  /** 自检警告（不合格的原因） */
  qa?: string[];
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
  // 评分 = 形状 IoU − 握把与手的偏差：车把必须落在手里，形状再像但握把对不上手也不选
  const hands = await handPoints(green, W, H, gm, ai);
  const groundY = groundRow(gm, W, H);
  let bx0 = W, bx1 = 0;
  for (let i = 0; i < gm.length; i++) if (gm[i] > 128) { const x = i % W; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }
  const bikeW = Math.max(1, bx1 - bx0);
  const searchViews = async (views: SilhouetteView[], tag: string) => {
    const { files, grips } = await renderSilhouettes(glb, path.join(dir, `sil-${tag}`), p.lensMm, views);
    let best = { view: views[0], iou: -1, score: -Infinity, gripErr: NaN };
    for (let i = 0; i < files.length; i++) {
      const fit = await fitMask(files[i], gm, W, H).catch(() => null);
      if (!fit) continue;
      let gripErr = NaN;
      const g = (grips[i] ?? []).slice().sort((a, b) => a[0] - b[0]);
      if (hands.length >= 2 && g.length >= 2) {
        const an = await anchorFit(files[i], fit, g, hands, groundY);
        if (an) gripErr = g.reduce((s, q, k) => s + Math.hypot(an.left + q[0] * an.scale - hands[k][0], an.top + q[1] * an.scale - hands[k][1]), 0) / g.length / bikeW;
      }
      const score = fit.iou - (Number.isFinite(gripErr) ? 1.5 * gripErr : 0);
      if (score > best.score) best = { view: views[i], iou: fit.iou, score, gripErr };
    }
    return best;
  };
  const t1 = Date.now();
  // 车把转向只在有 rig 文件时搜索；孩子扶车时 AI 常把车把画成转向的，不转就对不上手
  const hasRig = fs.existsSync(`${glb}.rig.json`);
  const steers = hasRig ? [-30, 0, 30] : [0];
  const coarse: SilhouetteView[] = [];
  for (let a = 10; a <= 80; a += 10) for (const e of [p.elevationDeg - 10, p.elevationDeg, p.elevationDeg + 10]) for (const r of new Set([p.rollDeg * sign * -1, 0])) for (const st of steers) coarse.push({ azimuth_deg: sign * a, elevation_deg: e, roll_deg: r, steer_deg: st });
  const b1 = await searchViews(coarse, "coarse");
  const fine: SilhouetteView[] = [];
  for (const da of [-5, 0, 5]) for (const de of [-5, 0, 5]) for (const dr of [-6, 0, 6]) for (const ds of hasRig ? [-15, 0, 15] : [0]) fine.push({ azimuth_deg: b1.view.azimuth_deg + da, elevation_deg: b1.view.elevation_deg + de, roll_deg: b1.view.roll_deg + dr, steer_deg: (b1.view.steer_deg ?? 0) + ds });
  const b2 = await searchViews(fine, "fine");
  const bestView = b2.score > b1.score ? b2 : b1;
  const view = bestView.view;
  const searchSeconds = Math.round((Date.now() - t1) / 1000);

  // 按匹配到的视角正式渲染并对齐替换
  // 从去车后的背景里找太阳：画面内的太阳在产品后方 → 主光放在相机对面，按太阳在画面里的左右 / 高低偏移
  const sun = await estimateSun(clean, p.lensMm, view.elevation_deg);
  const backlit = sun.found || /逆光|背光|黄昏|夕阳|backlit|backlight|sunset|golden hour/i.test(basePrompt);
  const sunDir = view.azimuth_deg + 180 - (sun.found ? sun.dxDeg : 0);
  const sunElev = sun.found ? Math.min(40, Math.max(3, sun.elevDeg)) : 12;
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
    steer_deg: view.steer_deg ?? 0,
    // 用去车后的背景当环境光；主光放在相机对面低角度，模拟逆光太阳，轮廓光由 Blender 真实计算
    env_image: path.join(dir, "clean.png"),
    env_strength: p.envStrength,
    key_dir_deg: backlit ? sunDir : p.keyDirDeg,
    key_elev_deg: backlit ? sunElev : p.keyElevDeg,
    key_kelvin: backlit ? Math.min(p.keyKelvin, 3200) : p.keyKelvin,
    key_strength: backlit ? 9 : 3,
    rim_strength: backlit ? 160 : 80,
    // 电影轮廓灯：强度按背景高光亮度（太阳越亮、画面越暗，轮廓光越强）
    cine_rim: backlit ? Math.min(3, Math.max(0.6, (sun.brightness - sun.median) * 4)) : 0,
    cine_rim_kelvin: 2800,
    key_mix: backlit ? 1 : 0.4,
    exposure: p.exposure,
    samples: 128,
  });
  renderSeconds += Math.round((Date.now() - t2) / 1000);
  const fitIou = await fitMask(render.mask, gm, W, H);
  // 手 + 地面双约束：握把中心对到 AI 画面里握车把的手（黄色标注），车轮最低点对到地面线；没有手时只贴地
  const grips = ((render.meta.grips as number[][] | undefined) ?? []).map((g) => [g[0], g[1]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const anchored = await anchorFit(render.mask, fitIou, grips, hands, groundY);
  const fit0 = anchored ?? fitIou;
  // 贴地：CAD 车轮最低点对到 AI 画面的地面接触线，再在触地点下画接触阴影
  const snap = await snapToGround(render.mask, fit0, gm, W, H);
  const fit = snap.fit;
  const placed = await placedMask(render.mask, fit, W, H);
  const shadowed = await contactShadow(clean, placed, W, H);
  // 完整贴 CAD：一个像素不少，只在蓝色遮挡处露出人；曝光 / 色温系数按原 AI 画面里的车算
  const rep = await replaceProduct(shadowed, render.image, render.mask, fit, gm, W, H, p.protect === "tone" ? "grade" : p.protect, { occluder: occ, gradeRef: ai });
  fs.writeFileSync(path.join(dir, "replaced.png"), rep.final);
  // AI 只做重新打光：此时 AI 的车和 CAD 车位置重合；只取车身低频光影，形状 / 字标 / 细节保留 CAD
  const repUrl = await uploadFile(rep.final, "image/png");
  let relit = await runFlare(plateInput(harmonizePrompt(productName, hands.length > 0), aspect, [repUrl]));
  let calls = 4;
  // AI 打光有时会把车删掉或重画，车身就拿不到场景光影：自动重试一次，仍失败则在自检里标出
  let lost = await relightLoss(relit, rep.final, placed, W, H);
  if (lost > 0.35) {
    const retry = await runFlare(plateInput(`${harmonizePrompt(productName, hands.length > 0)} The white balance bike in the image MUST remain fully visible in the same place — never remove, hide or repaint it; only change its lighting.`, aspect, [repUrl]));
    calls++;
    const lost2 = await relightLoss(retry, rep.final, placed, W, H);
    if (lost2 < lost) { relit = retry; lost = lost2; }
  }
  fs.writeFileSync(path.join(dir, "relit.png"), relit);
  // 手握车把：AI 重画并盖在 CAD 握把上的手指像素保留 AI，其余车身像素仍锁死 CAD
  const gripPx = grips.map((g) => [fit.left + g[0] * fit.scale, fit.top + g[1] * fit.scale] as [number, number]);
  const handFix = hands.length ? await handFixMask(relit, rep.final, placed, gripPx, W, H) : Buffer.alloc(W * H);
  let handFixPx = 0;
  const visible = Buffer.from(placed);
  for (let i = 0; i < visible.length; i++) {
    if (handFix[i] > 128) handFixPx++;
    if (occ[i] > 128 || handFix[i] > 128) visible[i] = 0;
  }
  fs.writeFileSync(path.join(dir, "handfix.png"), await sharp(handFix, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer());
  const lit = await relightTransfer(relit, rep.final, visible, W, H);
  const locked = await lockScene(lit, rep.final, placed, W, H);
  const finalPng = locked.png;
  fs.writeFileSync(path.join(dir, "final.png"), finalPng);
  const qa = contactQa(gm, placed);
  if (lost > 0.35) qa.warnings.push(`AI 打光时删掉或重画了车（${Math.round(lost * 100)}% 车身变化），车身没有场景光影`);
  if (locked.drift > 0.05) qa.warnings.push(`AI 打光改动了产品周边以外 ${Math.round(locked.drift * 100)}% 的画面，已还原，请检查画面是否完整`);
  let occPx = 0;
  for (const v of occ) if (v > 128) occPx++;
  fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...fit, view, aiFacing: gm.facing, coarseIou: b1.iou, fineIou: b2.iou, occluderPixels: occPx, gain: rep.gain, sun, sunDir, sunElev, groundDy: snap.dy, hands, grips, anchored: Boolean(anchored), gripErr: bestView.gripErr, handFixPixels: handFixPx, sceneDrift: locked.drift, coverage: qa.coverage, relightLoss: lost, qa: qa.warnings, searchSeconds }));
  const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
  const files: [string, string][] = [["AI 完整画面", f("ai.png")], ["标注（绿=车 红=座椅 蓝=遮挡）", f("green.png")], ["去车后的背景", f("clean.png")]];
  return {
    bytes: finalPng,
    prompt: `${prompt}\n\n[CAD interaction] ${JSON.stringify({ ...p, view, fit })}`,
    usd: Number.isFinite(unit) ? unit * calls : 0,
    files,
    aiDrift: null,
    fit: { iou: Math.round(fit.iou * 100) / 100, coverage: Math.round(qa.coverage * 100) / 100 },
    qa: qa.warnings,
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
      return { result: { keyframe: toKeyframeView(k), files: r.files, aiDrift: r.aiDrift, fit: r.fit, qa: r.qa, renderSeconds: r.renderSeconds } };
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
