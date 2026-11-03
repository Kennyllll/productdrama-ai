// 分镜 → 产品渲染机位 / 光线参数（TASK-012b）。纯函数，客户端与服务端共用。
import type { LocalShot } from "@/lib/types";

export const CAD_KEYFRAME_MODEL = "cad-composite";

export interface CadParams {
  azimuthDeg: number; // 相机绕产品的方位角：0 = 正前，负 = 左前，±180 = 正后
  elevationDeg: number; // 相机仰角：负 = 仰拍
  lensMm: number;
  rollDeg: number; // 产品侧倾角：0 直立（被骑 / 被扶），10–18 靠在物体上，80–85 倒在地上；负值向另一侧
  keyDirDeg: number; // 主光方位角（相对产品）
  keyElevDeg: number;
  keyKelvin: number;
  x: number; // 产品在画面中的水平位置 0–1（中心）
  y: number; // 产品底部在画面中的垂直位置 0–1
  scale: number; // 产品高度占画面高度的比例 0.1–1
  envStrength: number; // 用空场景当环境光的强度（建议 0.6–2）
  exposure: number; // 产品曝光补偿 EV
  reflection: number; // 地面倒影强度 0–1（0 = 干燥地面）
  floorRoughness: number; // 倒影模糊程度 0.02–0.5
  interaction: boolean; // 产品与人物 / 场景有接触：AI 出完整画面 → 绿色遮罩定位 → CAD 对齐替换；否则空场景 + 合成
  reusePlate: boolean; // 复用该镜头上次生成的空场景（只调产品时省一次 Flare）
  harmonize: boolean; // 是否让 AI 做一次融合（之后用遮罩贴回产品像素）
  protect: "grade" | "pixel" | "tone"; // grade：CAD 像素 + 整车统一曝光 / 色温；pixel：CAD 原样；tone：低频取 AI（会把背景颜色混进产品，不推荐）
}

const ELEV: Record<LocalShot["angle"], number> = { 平视: 6, 低机位: -4, 高机位: 28, 俯视: 55, 过肩: 14, 主观视角: 20 };
const SCALE: Record<LocalShot["size"], number> = { 大远景: 0.12, 远景: 0.2, 全景: 0.4, 中景: 0.55, 近景: 0.7, 特写: 0.95, 大特写: 1.2 };

export function defaultCadParams(shot: LocalShot): CadParams {
  const hero = shot.product === "主体";
  return {
    azimuthDeg: -38,
    elevationDeg: ELEV[shot.angle] ?? 6,
    lensMm: shot.lens,
    rollDeg: /靠在|靠着|并排靠/.test(`${shot.productNote} ${shot.description}`) ? 14 : /倒在|躺在|倒地|摔倒|倒向/.test(`${shot.productNote} ${shot.description}`) ? 82 : 0,
    keyDirDeg: -60,
    keyElevDeg: 35,
    keyKelvin: /夜|暖|钨|窗|黄昏|golden|warm|night/i.test(shot.lighting) ? 3400 : 5400,
    x: hero ? 0.5 : 0.68,
    y: 0.88,
    scale: hero ? SCALE[shot.size] : SCALE[shot.size] * 0.7,
    envStrength: 1.2,
    exposure: 0,
    reflection: /雨|湿|水|wet|rain|镜面|石材|marble|polished/i.test(`${shot.description} ${shot.lighting}`) ? 0.7 : 0.2,
    floorRoughness: 0.12,
    interaction: shot.characterIds.length > 0 || /靠|扶|推|骑|跨|挂|抱/.test(`${shot.productNote} ${shot.description}`),
    reusePlate: false,
    harmonize: true,
    protect: "grade",
  };
}

export function clampCadParams(p: CadParams): CadParams {
  const c = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    azimuthDeg: c(p.azimuthDeg, -180, 180, -38),
    elevationDeg: c(p.elevationDeg, -15, 80, 6),
    lensMm: c(p.lensMm, 14, 200, 50),
    rollDeg: c(p.rollDeg, -90, 90, 0),
    keyDirDeg: c(p.keyDirDeg, -180, 180, -60),
    keyElevDeg: c(p.keyElevDeg, 5, 85, 35),
    keyKelvin: c(p.keyKelvin, 2000, 10000, 5400),
    x: c(p.x, 0, 1, 0.5),
    y: c(p.y, 0.2, 1, 0.88),
    scale: c(p.scale, 0.05, 1.5, 0.5),
    envStrength: c(p.envStrength, 0, 5, 1.2),
    exposure: c(p.exposure, -4, 4, 0),
    reflection: c(p.reflection, 0, 1, 0.3),
    floorRoughness: c(p.floorRoughness, 0.02, 0.5, 0.12),
    interaction: Boolean(p.interaction),
    reusePlate: Boolean(p.reusePlate),
    harmonize: Boolean(p.harmonize),
    protect: p.protect === "pixel" || p.protect === "tone" ? p.protect : "grade",
  };
}

/** 空场景提示词：同一镜头，但不出现产品，为产品留出位置 */
export function buildPlatePrompt(base: string, p: CadParams, productName: string): string {
  const side = p.x < 0.4 ? "left" : p.x > 0.6 ? "right" : "center";
  return [
    base.replace(/^Product:.*$/m, "").replace(/\n{2,}/g, "\n").trim(),
    `IMPORTANT: this is an EMPTY background plate. Do NOT show ${productName || "the product"} or any bike, scooter, toy, vehicle or similar object. Leave the ${side} foreground ground area clear and unobstructed so a real product can be composited there later; nothing may occupy that area. Ground surface must be fully visible there with natural lighting and shadows from the environment.`,
    `Camera height matches a lens of ${p.lensMm}mm at ${p.elevationDeg < 0 ? "low ground-level" : p.elevationDeg > 25 ? "high" : "slightly above knee"} height. Key light comes from the ${p.keyDirDeg < 0 ? "left" : "right"} at about ${p.keyKelvin}K.`,
  ].join("\n");
}

/** 接触镜头：让 AI 按 CAD 渲染图把产品画进完整画面（形状会有偏差，之后用 CAD 替换） */
export function buildInteractionPrompt(base: string, productName: string, bible: { key: string; value: string }[], productNote: string): string {
  const v = (k: string) => bible.find((f) => f.key === k)?.value?.trim() ?? "";
  const facts = [v("color-main") && `main color: ${v("color-main")}`, v("color-sub") && `other parts: ${v("color-sub")}`, v("geometry") && `geometry: ${v("geometry")}`, v("logo") && `logo: ${v("logo")}`, v("physics") && `physics: ${v("physics")}`].filter(Boolean).join("; ");
  return [
    base.replace(/^Product:.*$/m, "").replace(/\n{2,}/g, "\n").trim(),
    `Product: the FIRST attached image is a studio render of the real ${productName || "product"} (${facts}). Reproduce this exact product in the scene — same model, same parts, same colors and decal — and show it from the SAME viewing angle and lean as in the render, scaled correctly for the people in the scene. How it appears: ${productNote || "as described"}. It must obey its physics (${v("physics") || "no kickstand, cannot stand by itself"}): someone holds, rides or pushes it, or it leans on something, with visible contact. One single frozen moment, not a sequence: exactly one ${productName || "product"} in the frame and every person appears exactly once (no repeated figures, no multiple exposures, no before/after in one image).`,
  ].join("\n");
}

export const greenMaskPrompt = (productName: string) =>
  `Image labeling task, not a redesign. Paint flat solid colors, no shading: (1) the ${productName || "product"} (the white balance bike) — frame, wheels, handlebar, number plate — pure green #00FF00, exactly covering its visible pixels; (2) its saddle/seat pure red #FF0000; (3) any part of a person (hand, finger, arm, leg, foot) that is IN FRONT of the bike and overlaps it pure blue #0000FF — only the overlapping part. (4) any hand or fingers touching or gripping the handlebar grips: pure yellow #FFFF00 instead of blue. Do not color anything else. Keep every other pixel exactly unchanged.`;

export const removeProductPrompt = () =>
  `Image cleanup task. The flat pure green (#00FF00) area is a hole where an object was removed. Fill the entire green area with what is naturally behind it — road, curb, grass, the motorcycle, background, or a person's legs/clothing where they continue — matching surrounding texture, lighting, shadows and film grain. The hole must be filled with background only: do NOT draw any bike, scooter, wheel, toy or new object there. Leave no green. Keep every pixel outside the green area unchanged.`;

export const ghostFillPrompt = (productName: string) =>
  `Image cleanup task. The areas painted flat magenta (#FF00FF) are leftovers of a wrongly drawn object next to the ${productName || "product"}. Fill every magenta area with what would naturally be behind it — road, curb, grass, background, or the person's hand/clothing if it continues there — matching the surrounding texture, lighting and film grain exactly. Do not leave any magenta. Do not change the white balance bike or anything else outside the magenta areas; do not add objects.`;

export const harmonizePrompt = (productName: string, holdHands = false) =>
  `Photo compositing cleanup, not a redesign. A real ${productName || "product"} (rendered from its CAD model) has been placed into this film still. Make it belong to the scene: match the scene's exposure, color temperature and light direction on the product; add realistic contact shadows and ambient occlusion where its wheels/feet meet the ground; if the ground is wet, glossy or reflective, paint the product's reflection on the ground consistent with the other reflections in the scene; add the scene's light reflections on glossy surfaces of the product; match film grain and softness.${holdHands ? " Hands: the child's hands must really hold the black rubber handlebar grips — fingers curled around each grip, palm resting on top, as if she is holding the bike up. You may redraw only her hands and fingers for this." : ""} STRICT: do not change the product's shape, proportions, parts, text or logo in any way; do not move or resize it; keep everything else in the scene unchanged.`;
