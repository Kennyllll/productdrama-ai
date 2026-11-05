"use server";

import fs from "node:fs";
import path from "node:path";
import { BlenderError, findBlender, renderProduct, renderScene, renderSilhouettes, type SilhouetteView } from "@/lib/blender";
import { solveCamera, wallFrame } from "@/lib/scene-geometry";
import { CAD_KEYFRAME_MODEL, supportNoun, buildPeopleOnlyPrompt, buildInteractionPrompt, buildProductFirstPrompt, buildProductFirstPlatePrompt, clampCadParams, buildPlatePrompt, greenMaskPrompt, harmonizePrompt, removeProductPrompt, type CadParams } from "@/lib/cad-camera";
import { anchorFit, composeProduct, contactShadow, estimateSun, fitMask, greenMask, groundRow, handFixMask,
  handPoints, lockScene, contactQa, relightLoss, occluderMask, type MaskFit, placedMask, productHoleImage, protectProduct, relightTransfer, replaceProduct, snapToGround } from "@/lib/cad-composite";
import sharp from "sharp";
import { deleteRequest, estimate, HiggsfieldError, submit, uploadFile, waitFor } from "@/lib/higgsfield";
import { addKeyframe, toKeyframeView, type KeyframeView } from "@/lib/keyframe-repo";
import { cadDir, getProductModel, modelPath } from "@/lib/model-repo";
import { findLocalProject, getProduct } from "@/lib/repo";
import { getVisionKey, locateGeometry, locateSupport, reviewKeyframe } from "@/lib/vision-qa";
import { getStoryboard } from "@/lib/storyboard-repo";
import { composeSetFirst } from "@/lib/set-composite";
import { findPhoto, listCharacters, photoPath } from "@/lib/cast-repo";

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
  // 靠物镜头必须侧倾 10–18°（两轮车无支架，直立 = 自己站着），两个方向都试，由 AI 画面里支撑物的位置决定；不靠物时按分镜值 / 直立
  const leaning = Math.abs(p.rollDeg) >= 8 && Math.abs(p.rollDeg) <= 30;
  const clampLean = (r: number) => (leaning ? Math.sign(r || 1) * Math.min(18, Math.max(10, Math.abs(r))) : r);
  const rolls = leaning ? [-16, -12, 12, 16] : [...new Set([p.rollDeg * sign * -1, 0])];
  const coarse: SilhouetteView[] = [];
  for (let a = 10; a <= 80; a += 10) for (const e of [p.elevationDeg - 10, p.elevationDeg, p.elevationDeg + 10]) for (const r of rolls) for (const st of steers) coarse.push({ azimuth_deg: sign * a, elevation_deg: e, roll_deg: r, steer_deg: st });
  const b1 = await searchViews(coarse, "coarse");
  const fine: SilhouetteView[] = [];
  for (const da of [-5, 0, 5]) for (const de of [-5, 0, 5]) for (const dr of leaning ? [-3, 0, 3] : [-6, 0, 6]) for (const ds of hasRig ? [-15, 0, 15] : [0]) fine.push({ azimuth_deg: b1.view.azimuth_deg + da, elevation_deg: b1.view.elevation_deg + de, roll_deg: clampLean(b1.view.roll_deg + dr), steer_deg: (b1.view.steer_deg ?? 0) + ds });
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
  if (leaning && Math.abs(view.roll_deg) < 10) qa.warnings.push(`靠物镜头的车只侧倾 ${Math.abs(view.roll_deg)}°，看起来会像自己立着`);
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

/** 接触镜头（产品先行）：AI 出无人空场景 → CAD 车按分镜机位 / 姿态放进去 → AI 在这张照片里加人（骑、扶、靠） → 标注遮挡 → CAD 像素贴回 + AI 光影迁移 */
type ProductFirstResult = Omit<CadKeyframeResult, "keyframe"> & { bytes: Buffer; prompt: string; usd: number; productBox?: { x0: number; y0: number; x1: number; y1: number } };

async function sceneMatchKeyframe(o: { projectId: string; shotId: string; p: CadParams; basePrompt: string; dir: string; glb: string; aspect: string; productName: string; productNote: string; description: string; hasPeople: boolean; plate: Buffer; plateCalls: number; support: string; sizeHint: string; roll: number }): Promise<ProductFirstResult> {
  const { p, dir, plate } = o;
  const pm = await sharp(plate).metadata();
  const PW = pm.width ?? 1600, PH = pm.height ?? 900;
  const spent = o.plateCalls ? `（已生成 ${o.plateCalls} 张空场景）` : "";
  // Gemini 每次读出的线有偏差：读三次、各自解相机，取相机高度的中位数，且至少两次互相吻合
  const tries = await Promise.allSettled([0, 1, 2].map(() => locateGeometry({ plate, support: supportNoun(o.productNote) || o.support, width: PW, height: PH })));
  const geos = tries.flatMap((t) => (t.status === "fulfilled" && t.value && (t.value.refs.length || t.value.horizonY != null) ? [t.value] : []));
  if (!geos.length) {
    const r = tries.find((t): t is PromiseRejectedResult => t.status === "rejected")?.reason;
    if (r) throw new Error(`场景几何定位没有完成：${r instanceof Error ? r.message : "未知错误"}。已停止${spent}，可勾选「复用上次空场景」重试`);
    throw new Error(`空场景里没找到墙脚线或已知高度的参照物，算不出相机。已停止${spent}`);
  }
  const heightHint = p.elevationDeg < 0 ? 0.6 : p.elevationDeg < 15 ? 1.3 : 1.7;
  const solves = geos.map((g) => ({ g, cam: solveCamera(g, PW, PH, p.lensMm, heightHint) })).sort((a, b) => a.cam.heightM - b.cam.heightM);
  const mid = solves[Math.floor(solves.length / 2)];
  if (solves.filter((s) => Math.abs(s.cam.heightM - mid.cam.heightM) <= 0.25 * mid.cam.heightM).length < Math.min(2, solves.length))
    throw new Error(`几次读空场景算出的相机互相矛盾（相机高 ${solves.map((s) => s.cam.heightM.toFixed(2)).join(" / ")} m），这张空场景的透视不可信。已停止${spent}`);
  const { g: geo, cam } = mid;
  const wall = wallFrame(geo, PW, PH, cam);
  if (!wall) throw new Error(`墙脚线不在相机前方的地面上，相机解算失败。已停止${spent}`);
  const t0 = Date.now();
  const rs = await renderScene({
    glb: o.glb, out: path.join(dir, "scene.png"), width: PW, height: PH,
    lens_mm: cam.lensMm, cam_height: cam.heightM, pitch_deg: cam.pitchDeg, wall, place: wall.place,
    roll_deg: Math.min(18, Math.max(10, Math.abs(o.roll))), yaw_off_deg: -25,
    env_image: path.join(dir, "plate.png"), env_strength: 1.6,
    sun_az_deg: 180 - p.keyDirDeg, sun_elev_deg: p.keyElevDeg, sun_kelvin: p.keyKelvin, sun_strength: 4,
    exposure: 0.6 + (p.exposure ?? 0), samples: 96, contact_light: 400,
  });
  const renderSeconds = Math.round((Date.now() - t0) / 1000);
  const layer = (w: number, h: number) => sharp(rs.image).resize(w, h, { fit: "fill" }).png().toBuffer();
  const over = async (img: Buffer) => {
    const m = await sharp(img).metadata();
    return sharp(img).composite([{ input: await layer(m.width ?? PW, m.height ?? PH) }]).png().toBuffer();
  };
  const ref = await over(plate);
  fs.writeFileSync(path.join(dir, "product-ref.png"), ref);
  const mk = await sharp(rs.mask).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (let i = 0; i < mk.data.length; i++)
    if (mk.data[i] > 128) {
      const x = (i % mk.info.width) / mk.info.width, y = Math.floor(i / mk.info.width) / mk.info.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  if (x1 <= x0) throw new Error("3D 场景匹配后车不在画面里，相机解算可能不对");
  const dist = Math.hypot(wall.place[0], wall.place[1]);
  const qa: string[] = [`3D 场景匹配：相机高 ${cam.heightM.toFixed(2)} m、俯仰 ${cam.pitchDeg.toFixed(1)}°、${cam.lensMm} mm；车离相机 ${dist.toFixed(1)} m，向墙倾 ${Math.abs(rs.meta.roll_deg).toFixed(0)}°`];
  // 车离得远、在画面里太小：按车和人的范围裁近（最多 2 倍）再放大回原尺寸，相当于换长焦
  const nearCrop = async (img: Buffer) => {
    if ((y1 - y0) * 1.15 > 0.3) return null;
    let ux0 = x0, ux1 = x1, uy0 = y0, uy1 = y1;
    // 人的范围：AI 加人后和空场景差别大的区域（低分辨率比较）
    const w = 96, h = Math.max(1, Math.round((96 * PH) / PW));
    const [a, b] = await Promise.all([img, plate].map((x) => sharp(x).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer()));
    const cols = new Array<number>(w).fill(0), rows = new Array<number>(h).fill(0);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        if ((Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 > 60) { cols[x]++; rows[y]++; }
      }
    const xs = cols.flatMap((c, i) => (c >= 3 ? [i] : [])), ys = rows.flatMap((c, i) => (c >= 2 ? [i] : []));
    if (xs.length && ys.length && xs.length < 0.6 * w) {
      ux0 = Math.min(ux0, xs[0] / w); ux1 = Math.max(ux1, (xs[xs.length - 1] + 1) / w);
      uy0 = Math.min(uy0, ys[0] / h); uy1 = Math.max(uy1, (ys[ys.length - 1] + 1) / h);
    }
    const s = Math.min(1, Math.max(0.5, (y1 - y0) / 0.3, ux1 - ux0 + 0.08, uy1 - uy0 + 0.08));
    if (s > 0.87) return null;
    const cx = Math.min(1 - s / 2, Math.max(s / 2, (ux0 + ux1) / 2)), cy = Math.min(1 - s / 2, Math.max(s / 2, (uy0 + uy1) / 2));
    return { s, l: cx - s / 2, t: cy - s / 2 };
  };
  const cut = (img: Buffer, c: Awaited<ReturnType<typeof nearCrop>>) =>
    c ? sharp(img).extract({ left: Math.round(c.l * PW), top: Math.round(c.t * PH), width: Math.round(c.s * PW), height: Math.round(c.s * PH) }).resize(PW, PH, { fit: "fill", kernel: "lanczos3" }).png().toBuffer() : Promise.resolve(img);
  const boxIn = (c: Awaited<ReturnType<typeof nearCrop>>) => (c ? { x0: (x0 - c.l) / c.s, y0: (y0 - c.t) / c.s, x1: (x1 - c.l) / c.s, y1: (y1 - c.t) / c.s } : { x0, y0, x1, y1 });
  const meta0 = { mode: "scene-match", cam, wall, geo, render: rs.meta, box: { x0, y0, x1, y1 } };
  const f = (name: string) => `/api/cad/${o.projectId}?f=${o.shotId.toLowerCase()}/${name}`;
  if (!o.hasPeople) {
    const c = await nearCrop(plate);
    if (c) qa.push(`车太远，构图自动裁近 ${(1 / c.s).toFixed(2)} 倍`);
    const out = await cut(ref, c);
    fs.writeFileSync(path.join(dir, "final.png"), out);
    fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...meta0, crop: c, qa }));
    return { bytes: out, prompt: `[CAD scene-match] ${JSON.stringify(cam)}`, usd: 0, files: [["空场景 + 真车（3D 匹配）", f("product-ref.png")]], aiDrift: null, fit: { iou: 1, coverage: 1 }, qa, renderSeconds, productBox: boxIn(c) };
  }
  // 有人：AI 只在空场景上加人（看不到车），机位不变，所以同一张 3D 渲染直接叠上去
  const prompt = buildPeopleOnlyPrompt(o.basePrompt, o.productName, o.support, (x0 + x1) / 2);
  const refUrl = await uploadFile(plate, "image/png");
  const unit = await estimate(PLATE_MODEL, plateInput(prompt, o.aspect, [refUrl])).then((r) => r.usd).catch(() => NaN);
  let calls = o.plateCalls;
  // 车位（外扩 15%）里画面变了多少 = 人或别的东西占了车位
  const occupied = async (img: Buffer) => {
    const [a, b] = await Promise.all([img, plate].map((x) => sharp(x).resize(PW, PH, { fit: "fill" }).removeAlpha().raw().toBuffer()));
    const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
    let n = 0, hit = 0;
    for (let y = Math.max(0, Math.floor((y0 - my) * PH)); y < Math.min(PH, Math.ceil((y1 + my) * PH)); y++)
      for (let x = Math.max(0, Math.floor((x0 - mx) * PW)); x < Math.min(PW, Math.ceil((x1 + mx) * PW)); x++) {
        const i = (y * PW + x) * 3;
        n++;
        if ((Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 > 40) hit++;
      }
    return n ? hit / n : 1;
  };
  const tryOnce = async () => {
    const raw = await runFlare(plateInput(prompt, o.aspect, [refUrl]));
    calls++;
    fs.writeFileSync(path.join(dir, "ai-raw.png"), raw);
    const spot = await locateSupport({ plate: raw, productName: o.productName, productNote: o.productNote, description: o.description, sizeHint: o.sizeHint, cast: true });
    return { raw, intruders: spot.intruders, occ: await occupied(raw) };
  };
  const bad = (t: { intruders: string[]; occ: number }) => t.intruders.length > 0 || t.occ > 0.25;
  let t = await tryOnce();
  if (bad(t)) {
    const t2 = await tryOnce();
    if (!bad(t2) || t2.occ < t.occ) t = t2;
  }
  fs.writeFileSync(path.join(dir, "ai.png"), t.raw);
  const meta1 = { ...meta0, occupied: t.occ, intruders: t.intruders, calls };
  if (bad(t)) {
    fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...meta1, failed: true, qa }));
    const cost = Number.isFinite(unit) ? `，已花约 $${(unit * calls).toFixed(2)}` : "";
    const why = t.intruders.length ? `AI 加人时又画了不该有的：${t.intruders.join("、")}` : `AI 加的人或东西占了车位（${Math.round(t.occ * 100)}%）`;
    throw new Error(`${why}，这张不合格，没有保存${cost}。中间图在该镜头的 cad 目录`);
  }
  const c = await nearCrop(t.raw);
  if (c) qa.push(`车太远，构图自动裁近 ${(1 / c.s).toFixed(2)} 倍`);
  const final = await cut(await over(t.raw), c);
  fs.writeFileSync(path.join(dir, "final.png"), final);
  fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...meta1, crop: c, qa }));
  return {
    bytes: final,
    prompt: `${prompt}\n\n[CAD scene-match] ${JSON.stringify({ cam, place: wall.place })}`,
    usd: Number.isFinite(unit) ? unit * calls : 0,
    files: [["空场景 + 真车（3D 匹配）", f("product-ref.png")], ["AI 加人后（没有车）", f("ai.png")]],
    aiDrift: null,
    fit: { iou: 1, coverage: 1 },
    qa,
    renderSeconds,
    productBox: boxIn(c),
  };
}

/** 3D 布景先行（车库靠墙）：车库硬体 + 真车都在 Blender 里，相机 / 接触 / 倾斜 / 阴影由程序定；AI 只写实化并按角色照加人；露出的 AI 车去重影后贴回真车 */
async function setFirstKeyframe(o: { projectId: string; shotId: string; p: CadParams; basePrompt: string; dir: string; glb: string; aspect: string; productNote: string; characterIds: string[] }): Promise<ProductFirstResult> {
  const { p, dir } = o;
  const [W, H] = o.aspect === "9:16" ? [1152, 2048] : o.aspect === "16:9" ? [2560, 1440] : [2688, 1152];
  const D = 3.0;
  const x = /左/.test(o.productNote) ? -0.9 : /右/.test(o.productNote) ? 0.6 : -0.35;
  const t0 = Date.now();
  const rs = await renderScene({
    glb: o.glb, out: path.join(dir, "set.png"), out_plate: path.join(dir, "set-plate.png"), width: W, height: H,
    // 相机在车前左侧约 45° 斜看墙：正对墙拍时，车向墙的侧倾和车把碰墙在画面里看不出来，像自己立着
    lens_mm: 40, cam_height: 0.6, pitch_deg: 3, cam_pos: [x - 1.55, D - 1.5, 0.9], look_at: [x - 0.07, D - 0.15, 0.32],
    wall: { a: [-3, D], dir: [1, 0], normal: [0, -1] }, place: [x, D], roll_deg: 14, yaw_off_deg: -10, set: { garage: true },
    sun_az_deg: -115, sun_elev_deg: 14, sun_kelvin: p.keyKelvin, sun_strength: 5, exposure: p.exposure ?? 0, samples: 96,
  });
  const renderSeconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(dir, "product-ref.png"), await sharp(rs.image).removeAlpha().png().toBuffer());
  // 给 AI 的是无车底图（车对相机不可见，车影保留）：AI 看到车就会重画一辆略有偏差的，贴回真车后变重影
  const cg = await sharp(path.join(dir, "set-plate.png")).removeAlpha().png().toBuffer();
  // 角色照：每个出场角色取第一张参考照
  const chars = listCharacters(o.projectId).filter((c) => o.characterIds.includes(c.id));
  const refs = chars.flatMap((c) => {
    const ph = c.photos[0] && findPhoto(c.photos[0].id);
    return ph && fs.existsSync(photoPath(ph)) ? [{ name: c.name, file: photoPath(ph) }] : [];
  }).slice(0, 3);
  const product = getProduct(o.projectId)?.name || "balance bike";
  const scene = (o.basePrompt.match(/^Scene: (.*)$/m)?.[1] ?? "").split(/(?<=[。！？.!?])/).filter((s) => !/平衡车|童车|车把|座椅|轮子|balance bike|bike|handlebar|saddle/i.test(s)).join("");
  const cast = (o.basePrompt.match(/^Characters[^:]*: (.*)$/m)?.[1] ?? "").split(";").map((c) => c.trim()).filter(Boolean);
  const prompt = [
    "The first attached image is a 3D layout render of the inside of a suburban North American garage; the camera, the walls, the floor, the sunlight pattern and every shadow are final.",
    "Turn it into a photorealistic cinematic film still shot on a cinema camera, fine film grain.",
    scene ? `Story context: ${scene}` : "",
    "Keep the exact camera, perspective and layout: the back wall, the low concrete stem wall along its base, the floor line, the sunlight pattern and every shadow stay where they are.",
    `The shadow on the back wall and floor belongs to a ${product} that will be composited in later: keep that shadow exactly, keep the floor and wall in front of it empty, and do not draw any bike, balance bike, scooter, toy or vehicle anywhere.`,
    "Give the drywall, the concrete stem wall and the concrete floor real-world texture: slight scuffs, a faint oil stain, fine dust in the sunbeam.",
    cast.length ? `Add exactly ${cast.length} ${cast.length === 1 ? "person" : "people"}: ${cast.join("; ")}. Nobody else. ${o.productNote.match(/[^。]*(?:站|看|抱|holding|stand)[^。]*/)?.[0] ?? ""} Every person stands with both feet on the floor at least two steps away from that shadow. Every prop appears exactly once: a helmet held in the hands is not also worn.` : "Add no people.",
    refs.length ? `Use the other attached photo${refs.length > 1 ? "s" : ""} only as the face, hair and outfit reference for ${refs.map((r) => r.name).join(", ")}; take nothing else from them.` : "",
    "On the far right add ordinary American garage details against the right wall (a metal shelf with paint cans), One single frozen moment.",
  ].filter(Boolean).join(" ");
  const urls = [await uploadFile(cg, "image/png"), ...(await Promise.all(refs.map(async (r) => uploadFile(await sharp(r.file).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer(), "image/jpeg"))))];
  const input = plateInput(prompt, o.aspect, urls);
  const unit = await estimate(PLATE_MODEL, input).then((r) => r.usd).catch(() => NaN);
  const ai = await runFlare(input);
  fs.writeFileSync(path.join(dir, "ai.png"), ai);
  const comp = await composeSetFirst({ ai, cad: rs.image, plate: path.join(dir, "set-plate.png"), mask: rs.mask });
  fs.writeFileSync(path.join(dir, "final.png"), comp.image);
  const qa = [`3D 布景先行：车库布景、相机高 0.6 m、${Math.min(50, Math.max(24, p.lensMm))} mm；车向墙倾 ${Math.abs(rs.meta.roll_deg).toFixed(0)}°，${rs.meta.contact.part ? "车把碰墙" : "接触点未知"}`, refs.length ? `角色照：${refs.map((r) => r.name).join("、")}` : "没有角色照，人物只按文字描述"];
  fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ mode: "set-first", render: rs.meta, ghostPx: comp.ghostPx, refs: refs.map((r) => r.name), qa }));
  const f = (name: string) => `/api/cad/${o.projectId}?f=${o.shotId.toLowerCase()}/${name}`;
  return {
    bytes: comp.image,
    prompt: `${prompt}\n\n[CAD set-first] ${JSON.stringify({ place: [x, D], roll: rs.meta.roll_deg })}`,
    usd: Number.isFinite(unit) ? unit : 0,
    files: [["3D 布景 + 真车", f("product-ref.png")], ["AI 写实化", f("ai.png")]],
    aiDrift: null,
    fit: { iou: 1, coverage: 1 },
    qa,
    renderSeconds,
    productBox: comp.box,
  };
}

async function productFirstKeyframe(projectId: string, shotId: string, p: CadParams, basePrompt: string, dir: string, glb: string, aspect: string, productNote: string, hasPeople: boolean, description: string, characterIds: string[] = []): Promise<Omit<CadKeyframeResult, "keyframe"> & { bytes: Buffer; prompt: string; usd: number; productBox?: { x0: number; y0: number; x1: number; y1: number } }> {
  const product = getProduct(projectId);
  const productName = product?.name ?? "";
  // 靠物：车必须向远离镜头的方向倒（支撑物在车后面，不挡车）。相机水平方向 (sin az, −cos az)，侧倾后车的竖直轴 (0, −sin r, cos r)，点积 = cos az · sin r
  const az = (p.azimuthDeg * Math.PI) / 180;
  const leaning = Math.abs(p.rollDeg) >= 8 && Math.abs(p.rollDeg) <= 30;
  const fallen = Math.abs(p.rollDeg) > 60;
  let roll = p.rollDeg;
  if (leaning) {
    const r = Math.min(18, Math.max(10, Math.abs(roll)));
    roll = Math.cos(az) >= 0 ? -r : r;
  }
  // 画面左右：相机右方向 (cos az, sin az)，点积 = −sin az · sin r
  const sideOf = (r: number) => (-Math.sin(az) * Math.sin((r * Math.PI) / 180) > 0 ? "right" : "left");
  let leanSide: "left" | "right" | null = leaning ? sideOf(roll) : null;
  // 车库里靠墙：走 3D 布景先行，不再让 AI 出空场景再估透视
  if (leaning && /墙|wall/i.test(supportNoun(productNote)) && /garage|车库/i.test(`${description}\n${basePrompt}`))
    return setFirstKeyframe({ projectId, shotId, p, basePrompt, dir, glb, aspect, productNote, characterIds });
  // 1) 空场景：同一镜头但没有人、没有车；靠物镜头必须包含支撑物
  const plateFile = path.join(dir, "plate.png");
  const reused = p.reusePlate && fs.existsSync(plateFile);
  // 提示词里只写支撑物本身，不写产品如何靠；否则 AI 会在空场景里画一辆车
  const makePlate = () => runFlare(plateInput(buildProductFirstPlatePrompt(basePrompt, p, productName, leaning ? supportNoun(productNote) : ""), aspect));
  let plate = reused ? fs.readFileSync(plateFile) : await makePlate();
  let plateCalls = reused ? 0 : 1;
  // 1b) 靠物镜头：看图找到支撑物，车放在它前面、车顶碰到它（位置和大小由支撑物决定，不再让 AI 去挪车）。
  // 定位失败就停止：按默认位置放车必然「靠空气」，继续只会白花钱
  let place: CadParams = p;
  let support = "";
  let plateBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const preQa: string[] = [];
  if (leaning) {
    if (!getVisionKey()) throw new Error("靠物镜头需要看图定位支撑物，请先在设置页配置 Gemini Key");
    const geometry = product?.bible?.find((b) => b.key === "geometry")?.value ?? "";
    const spent = () => (plateCalls ? `（已生成 ${plateCalls} 张空场景）` : "");
    const find = async () => {
      try {
        return await locateSupport({ plate, productName, productNote, description, sizeHint: geometry || "small two-wheel children's balance bike" });
      } catch (e) {
        fs.writeFileSync(plateFile, plate);
        throw new Error(`支撑物定位没有完成：${e instanceof Error ? e.message : "未知错误"}。已停止${spent()}，可勾选「复用上次空场景」重试`);
      }
    };
    let spot = await find();
    if ((spot.intruders.length || !spot.box) && !reused) {
      plate = await makePlate();
      plateCalls++;
      spot = await find();
    }
    fs.writeFileSync(plateFile, plate);
    if (spot.intruders.length) throw new Error(`空场景里出现了不该有的：${spot.intruders.join("、")}。已停止${spent()}`);
    if (!spot.box) throw new Error(`空场景里没找到分镜写的支撑物。已停止${spent()}`);
    const b = spot.box;
    // 支撑物在车旁边（侧墙）时，车顶要朝它倾，而不是一律朝镜头后方倾
    plateBox = b;
    if (spot.lean !== "away" && sideOf(roll) !== spot.lean) roll = -roll;
    leanSide = sideOf(roll);
    place = { ...p, x: (b.x0 + b.x1) / 2, y: b.y1, scale: Math.min(0.9, Math.max(0.08, b.y1 - b.y0)) };
    support = spot.support;
    // 靠墙：3D 场景匹配（相机 / 地面 / 墙面由几何解出，车把或座椅的碰墙点由 Blender 算出）
    if (/wall|墙/i.test(`${support} ${supportNoun(productNote)}`))
      return sceneMatchKeyframe({ projectId, shotId, p, basePrompt, dir, glb, aspect, productName, productNote, description, hasPeople, plate, plateCalls, support, sizeHint: geometry || "small two-wheel children's balance bike", roll });
  } else fs.writeFileSync(plateFile, plate);
  // 2) 用空场景当环境光渲染真车（含接触阴影），按分镜位置 / 大小放进去
  const t0 = Date.now();
  const render = await renderProduct({
    glb,
    out: path.join(dir, "product.png"),
    width: 1600,
    height: 1600,
    azimuth_deg: p.azimuthDeg,
    elevation_deg: p.elevationDeg,
    lens_mm: p.lensMm,
    roll_deg: roll,
    key_dir_deg: p.keyDirDeg,
    key_elev_deg: p.keyElevDeg,
    key_kelvin: p.keyKelvin,
    env_image: plateFile,
    env_strength: p.envStrength,
    exposure: p.exposure,
    samples: 96,
  });
  const renderSeconds = Math.round((Date.now() - t0) / 1000);
  const comp = await composeProduct(plate, render.image, render.mask, place);
  const CW = comp.width, CH = comp.height;
  fs.writeFileSync(path.join(dir, "product-ref.png"), comp.composite);
  const productOnly = path.join(dir, "product-only.png");
  const alpha = await sharp(render.mask).ensureAlpha().extractChannel("alpha").toBuffer();
  await sharp(render.image).removeAlpha().joinChannel(alpha).png().toFile(productOnly);
  const renderW = (await sharp(render.image).metadata()).width ?? 1600;
  // 靠物且没人碰车：AI 只加人、看不到车，就没法把车挪走或重画
  const peopleFirst = leaning && !!support && !/握|扶|推|骑|坐|抱|拿|牵|hold|grip|ride|push/i.test(productNote);
  const refUrl = await uploadFile(peopleFirst ? plate : comp.composite, "image/png");
  const prompt = peopleFirst
    ? buildPeopleOnlyPrompt(basePrompt, productName, support, place.x)
    : buildProductFirstPrompt(basePrompt, productName, product?.bible ?? [], productNote, { leanDeg: leaning ? Math.abs(roll) : 0, leanSide, fallen, hasPeople, support });
  const unit = await estimate(PLATE_MODEL, plateInput(prompt, aspect, [refUrl])).then((r) => r.usd).catch(() => NaN);
  let calls = plateCalls;
  if (peopleFirst) {
    type Comp = Awaited<ReturnType<typeof composeProduct>>;
    // 车的位置上画面变了多少 = 人站到了车要放的地方
    const blocked = async (img: Buffer, o: Comp) => {
      const [a, pl] = await Promise.all([img, plate].map((b) => sharp(b).resize(o.width, o.height, { fit: "fill" }).removeAlpha().raw().toBuffer()));
      let n = 0, hit = 0;
      for (let y = o.box.top; y < o.box.top + o.box.height; y++)
        for (let x = o.box.left; x < o.box.left + o.box.width; x++) {
          const i = (y * o.width + x) * 3;
          n++;
          if ((Math.abs(a[i] - pl[i]) + Math.abs(a[i + 1] - pl[i + 1]) + Math.abs(a[i + 2] - pl[i + 2])) / 3 > 40) hit++;
        }
      return n ? hit / n : 1;
    };
    const geometry = product?.bible?.find((b) => b.key === "geometry")?.value ?? "";
    // 加人后再看图定位一次：车的大小以画面里的孩子为参照，并检查 AI 有没有自己画车
    type Box = { x0: number; y0: number; x1: number; y1: number };
    // AI 常常不听话在支撑物旁自己画一辆车：把车位周围还原成空场景像素（羽化边缘），再贴真车
    const restore = async (img: Buffer, boxes: Box[]) => {
      const m = await sharp(img).metadata();
      const W = m.width ?? CW, H = m.height ?? CH;
      const [a, pl] = await Promise.all([img, plate].map((b) => sharp(b).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer()));
      const x0 = Math.min(...boxes.map((b) => b.x0)), x1 = Math.max(...boxes.map((b) => b.x1));
      const y0 = Math.min(...boxes.map((b) => b.y0)), y1 = Math.max(...boxes.map((b) => b.y1));
      const w = x1 - x0, h = y1 - y0;
      const zx0 = (x0 - w * 0.4) * W, zx1 = (x1 + w * 0.4) * W, zy0 = (y0 - h * 0.2) * H, zy1 = (y1 + h * 0.08) * H;
      const fe = Math.max(8, W * 0.006);
      for (let y = Math.max(0, Math.floor(zy0)); y < Math.min(H, Math.ceil(zy1)); y++)
        for (let x = Math.max(0, Math.floor(zx0)); x < Math.min(W, Math.ceil(zx1)); x++) {
          const t = Math.min(1, Math.max(0, Math.min(x - zx0, zx1 - x, y - zy0, zy1 - y) / fe));
          const i = (y * W + x) * 3;
          for (let c = 0; c < 3; c++) a[i + c] = Math.round(a[i + c] * (1 - t) + pl[i + c] * t);
        }
      return sharp(a, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    };
    const locateCast = (img: Buffer) => locateSupport({ plate: img, productName, productNote, description, sizeHint: geometry || "small two-wheel children's balance bike", cast: true });
    const tryOnce = async () => {
      const raw = await runFlare(plateInput(prompt, aspect, [refUrl]));
      calls++;
      fs.writeFileSync(path.join(dir, "ai-raw.png"), raw);
      let spot = await locateCast(raw);
      const boxes = [plateBox, spot.box].filter((b): b is Box => !!b);
      // 只在 AI 自己画了车时还原（还原会擦掉站在附近的人）
      const ai = boxes.length && spot.intruders.length ? await restore(raw, boxes) : raw;
      if (boxes.length && spot.intruders.length) {
        const again = await locateCast(ai);
        spot = again.box ? again : { ...spot, intruders: again.intruders };
      }
      if (!spot.box) return { ai, spot, out: null as Comp | null, pl: place, occupied: 1 };
      const b = spot.box;
      const pl: CadParams = { ...place, x: (b.x0 + b.x1) / 2, y: b.y1, scale: Math.min(0.9, Math.max(0.08, b.y1 - b.y0)) };
      const out = await composeProduct(ai, render.image, render.mask, pl);
      return { ai, spot, out: out as Comp | null, pl, occupied: await blocked(ai, out) };
    };
    const bad = (t: Awaited<ReturnType<typeof tryOnce>>) => !t.out || t.spot.intruders.length > 0 || t.occupied > 0.25;
    let t = await tryOnce();
    if (bad(t)) {
      const t2 = await tryOnce();
      if (!bad(t2) || (t2.out && !t.out)) t = t2;
    }
    const { ai, out, pl, occupied } = t;
    fs.writeFileSync(path.join(dir, "ai.png"), ai);
    const meta0 = { mode: "people-first", roll, leanSide, support: t.spot.support || support, place: { x: pl.x, y: pl.y, scale: pl.scale }, occupied, intruders: t.spot.intruders, calls };
    if (bad(t) || !out) {
      fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...meta0, failed: true, qa: preQa }));
      const cost = Number.isFinite(unit) ? `，已花约 $${(unit * calls).toFixed(2)}` : "";
      const why = t.spot.intruders.length
        ? `AI 加人时又画了不该有的：${t.spot.intruders.join("、")}`
        : !out
          ? "加人后画面里找不到支撑物"
          : `AI 加的人站到了车要放的位置（占 ${Math.round(occupied * 100)}%）`;
      throw new Error(`${why}，这张不合格，没有保存${cost}。中间图在该镜头的 cad 目录`);
    }
    fs.writeFileSync(path.join(dir, "final.png"), out.composite);
    const qa = [...preQa];
    fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...meta0, qa }));
    const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
    return {
      bytes: out.composite,
      prompt: `${prompt}\n\n[CAD people-first] ${JSON.stringify({ ...pl, roll })}`,
      usd: Number.isFinite(unit) ? unit * calls : 0,
      files: [["空场景 + 真车", f("product-ref.png")], ["AI 加人后（没有车）", f("ai.png")]],
      aiDrift: null,
      fit: { iou: 1, coverage: 1 },
      qa,
      renderSeconds,
    };
  }
  const attempt = async () => {
    const ai = await runFlare(plateInput(prompt, aspect, [refUrl]));
    calls++;
    const meta = await sharp(ai).metadata();
    const W = meta.width ?? CW, H = meta.height ?? CH;
    const k = W / CW;
    const fit: MaskFit = { left: comp.box.left * k, top: comp.box.top * (H / CH), scale: (comp.box.width / renderW) * k, iou: 0, coverage: 0 };
    const placed = await placedMask(render.mask, fit, W, H);
    const green = await runFlare(plateInput(greenMaskPrompt(productName), aspect, [await uploadFile(ai, "image/png")]));
    calls++;
    const gm = await greenMask(green, W, H);
    const occ = await occluderMask(green, W, H);
    // AI 必须把车留在原位：AI 画面里的车（绿 + 挡在车前的人）与 CAD 位置的重合度；车框外的绿色 = 又画了一辆车
    let x0 = W, x1 = -1, y0 = H, y1 = -1, pc = 0;
    for (let i = 0; i < W * H; i++) if (placed[i] > 128) { pc++; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
    let inter = 0, uni = 0, extra = 0;
    for (let i = 0; i < W * H; i++) {
      const g = gm[i] > 128, a = placed[i] > 128, o = occ[i] > 128;
      if (a && (g || o)) inter++;
      if (a || g) uni++;
      if (g && !a) { const x = i % W, y = (i / W) | 0; if (x < x0 - mx || x > x1 + mx || y < y0 - my || y > y1 + my) extra++; }
    }
    return { ai, green, gm, occ, W, H, fit, placed, keep: uni ? inter / uni : 0, extra: pc ? extra / pc : 0 };
  };
  let r = await attempt();
  if (r.keep < 0.6 || r.extra > 0.15) {
    const r2 = await attempt();
    if (r2.keep - r2.extra > r.keep - r.extra) r = r2;
  }
  const { ai, green, occ, W, H, fit, placed } = r;
  fs.writeFileSync(path.join(dir, "ai.png"), ai);
  fs.writeFileSync(path.join(dir, "green.png"), green);
  // AI 把车挪到别处（原位附近之外又有一辆）：再贴 CAD 会出现两辆车，直接判不合格，不生成关键帧
  // AI 只是在原位把车画大 / 画变形：把 AI 的车和 CAD 位置一起挖空交给 AI 补背景（AI 只看到一块绿色），再贴真车
  const repair = r.keep < 0.6 && r.extra <= 0.15 && r.keep >= 0.15;
  if (r.keep < 0.6 && !repair) {
    fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...fit, mode: "product-first", failed: true, roll, leanSide, support, place: { x: place.x, y: place.y, scale: place.scale }, keep: r.keep, extra: r.extra, calls, qa: preQa }));
    const cost = Number.isFinite(unit) ? `，已花约 $${(unit * calls).toFixed(2)}` : "";
    throw new Error(`AI 把车挪走或重画了（与真车重合 ${Math.round(r.keep * 100)}%），这张不合格，没有保存${cost}。中间图在该镜头的 cad 目录`);
  }
  let base = ai;
  if (repair) {
    const union = Buffer.alloc(W * H);
    for (let i = 0; i < union.length; i++) if (r.gm[i] > 128 || placed[i] > 128) union[i] = 255;
    const holeImg = await productHoleImage(ai, union, occ, W, H);
    fs.writeFileSync(path.join(dir, "hole.png"), holeImg);
    const clean = await runFlare(plateInput(removeProductPrompt(), aspect, [await uploadFile(holeImg, "image/png")]));
    calls++;
    base = await sharp(clean).resize(W, H, { fit: "fill" }).png().toBuffer();
    fs.writeFileSync(path.join(dir, "clean.png"), base);
    preQa.push(`AI 在原位重画了车（重合 ${Math.round(r.keep * 100)}%），已擦掉 AI 的车再贴真车；车身只做整体曝光 / 色温调整`);
  }
  const visible = Buffer.from(placed);
  for (let i = 0; i < visible.length; i++) if (occ[i] > 128) visible[i] = 0;
  // 完整贴 CAD（只在人挡在车前处露出 AI 画的人），整车按 AI 画面里同位置的车统一调曝光 / 色温，再迁移 AI 的低频光影
  const rep = await replaceProduct(base, productOnly, render.mask, fit, visible, W, H, "grade", { occluder: occ, gradeRef: ai });
  fs.writeFileSync(path.join(dir, "replaced.png"), rep.final);
  // 重画过的 AI 车和真车对不齐，光影迁移会把背景色混进车身，修复时跳过
  const finalPng = repair ? rep.final : await relightTransfer(ai, rep.final, visible, W, H);
  fs.writeFileSync(path.join(dir, "final.png"), finalPng);
  const lost = repair ? 0 : await relightLoss(ai, rep.final, visible, W, H);
  const qa: string[] = [...preQa];
  if (r.keep < 0.6 && !repair) qa.push(`AI 没有把车留在原位（重合 ${Math.round(r.keep * 100)}%），可能改了车的位置或形状`);
  if (r.extra > 0.15) qa.push("AI 在画面别处又画了一辆车");
  if (lost > 0.5) qa.push(`AI 重画了大部分车身（${Math.round(lost * 100)}%），车身光影可能不准`);
  fs.writeFileSync(path.join(dir, "fit.json"), JSON.stringify({ ...fit, mode: "product-first", roll, leanSide, support, place: { x: place.x, y: place.y, scale: place.scale }, keep: r.keep, extra: r.extra, gain: rep.gain, relightLoss: lost, calls, qa }));
  const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
  return {
    bytes: finalPng,
    prompt: `${prompt}\n\n[CAD product-first] ${JSON.stringify({ ...place, roll, fit })}`,
    usd: Number.isFinite(unit) ? unit * calls : 0,
    files: [["空场景 + 真车", f("product-ref.png")], ["AI 加人后", f("ai.png")], ["标注（绿=车 蓝=挡在车前的人）", f("green.png")]],
    aiDrift: null,
    fit: { iou: Math.round(r.keep * 100) / 100, coverage: Math.round(r.keep * 100) / 100 },
    qa,
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
      const runOnce = (q: CadParams = p) =>
        q.productFirst
          ? productFirstKeyframe(projectId, shotId, q, basePrompt, dir, modelPath(m), board.visualSpec.aspectRatio, shot.productNote, shot.characterIds.length > 0, shot.description, shot.characterIds)
          : interactionKeyframe(projectId, shotId, p, basePrompt, dir, modelPath(m), board.visualSpec.aspectRatio, shot.productNote);
      const save = (x: Awaited<ReturnType<typeof runOnce>>) => {
        const k = addKeyframe({ projectId, shotId, bytes: x.bytes, model: CAD_KEYFRAME_MODEL, prompt: x.prompt, usd: x.usd });
        if (!k) throw new Error("保存关键帧失败");
        return k;
      };
      // 看图质检（Gemini）：不合格自动重跑一次，两张都留作候选，返回问题更少的那张
      const bible = getProduct(projectId)?.bible ?? [];
      const bv = (key: string) => bible.find((b) => b.key === key)?.value ?? "";
      const facts = ["color-main", "color-sub", "geometry", "logo"].map(bv).filter(Boolean).join("; ");
      const look = async (bytes: Buffer, box?: { x0: number; y0: number; x1: number; y1: number }): Promise<{ issues: string[]; failed: boolean }> => {
        if (!getVisionKey()) return { issues: [], failed: false };
        const ref = path.join(dir, "product-only.png");
        try {
          // 车在画面里小时只看全图会误判：另附一张车周围的放大图
          let zoom: Buffer | undefined;
          if (box) {
            const m = await sharp(bytes).metadata();
            const W = m.width ?? 0, H = m.height ?? 0, bw = box.x1 - box.x0, bh = box.y1 - box.y0;
            const l = Math.max(0, box.x0 - bw * 0.6), t = Math.max(0, box.y0 - bh * 0.6), rr = Math.min(1, box.x1 + bw * 0.6), b = Math.min(1, box.y1 + bh * 0.4);
            if (W && H && rr > l && b > t) zoom = await sharp(bytes).extract({ left: Math.round(l * W), top: Math.round(t * H), width: Math.max(1, Math.round((rr - l) * W)), height: Math.max(1, Math.round((b - t) * H)) }).png().toBuffer();
          }
          const v = await reviewKeyframe({ image: bytes, productRef: fs.existsSync(ref) ? fs.readFileSync(ref) : undefined, zoom, productName, productFacts: facts, physics: bv("physics"), description: shot.description, productNote: shot.productNote });
          return { issues: v.pass ? [] : (v.issues.length ? v.issues : ["不合格（未给出原因）"]).map((x) => `看图质检：${x}`), failed: false };
        } catch (e) {
          return { issues: [`看图质检没有完成：${e instanceof Error ? e.message : "未知错误"}`], failed: true };
        }
      };
      let r = await runOnce();
      let seen = await look(r.bytes, "productBox" in r ? (r.productBox as { x0: number; y0: number; x1: number; y1: number } | undefined) : undefined);
      let k = save(r);
      let files = r.files;
      if (seen.issues.length && !seen.failed) {
        // 重跑复用刚才合格的空场景，空场景不再重抽；重跑失败就保留第一张和它的问题
        const r2 = await runOnce({ ...p, reusePlate: true }).catch((e: unknown) => {
          seen.issues.push(`自动重跑失败：${e instanceof Error ? e.message : "未知错误"}`);
          return null;
        });
        if (!r2) return { result: { keyframe: toKeyframeView(k), files, aiDrift: r.aiDrift, fit: r.fit, qa: [...(r.qa ?? []), ...seen.issues], renderSeconds: r.renderSeconds } };
        const seen2 = await look(r2.bytes, "productBox" in r2 ? (r2.productBox as { x0: number; y0: number; x1: number; y1: number } | undefined) : undefined);
        const k2 = save(r2);
        if ((r2.qa?.length ?? 0) + seen2.issues.length < (r.qa?.length ?? 0) + seen.issues.length) {
          r = r2;
          seen = seen2;
          k = k2;
          files = r2.files;
        } else files = []; // 中间文件已被重跑覆盖
      }
      return { result: { keyframe: toKeyframeView(k), files, aiDrift: r.aiDrift, fit: r.fit, qa: [...(r.qa ?? []), ...seen.issues], renderSeconds: r.renderSeconds } };
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
