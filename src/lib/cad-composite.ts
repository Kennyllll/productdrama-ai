// 受保护合成（TASK-012b）：把 Blender 渲染的产品（透明背景，含接触阴影）放进 AI 空场景；
// AI 融合后再用产品遮罩把原始产品像素贴回，保证产品几何与 Logo 零变化。
import fs from "node:fs";
import sharp from "sharp";

export interface Placement {
  x: number; // 产品中心水平位置 0–1
  y: number; // 产品底部垂直位置 0–1
  scale: number; // 产品高度 / 画面高度
}

async function alphaBounds(png: string | Buffer): Promise<{ left: number; top: number; width: number; height: number; w: number; h: number }> {
  const img = sharp(png).ensureAlpha();
  const { width: w = 0, height: h = 0 } = await img.metadata();
  const alpha = await img.extractChannel("alpha").raw().toBuffer();
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > 64) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  if (r < 0) throw new Error("产品渲染为空（遮罩里没有像素）");
  return { left: l, top: t, width: r - l + 1, height: b - t + 1, w, h };
}

/**
 * 把产品渲染（带阴影）与产品遮罩按同一变换放到场景尺寸上；返回合成图与对齐后的遮罩。
 * reflection：同机位渲染的地面倒影层（黑底），按强度以 screen 方式叠在产品之下。
 */
export async function composeProduct(plate: Buffer, productPng: string, maskPng: string, place: Placement, reflection?: { file: string; strength: number }) {
  const meta = await sharp(plate).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const bb = await alphaBounds(maskPng);
  const s = (place.scale * H) / bb.height;
  const rw = Math.max(1, Math.round(bb.w * s));
  const rh = Math.max(1, Math.round(bb.h * s));
  // 产品包围盒中心 x → place.x * W；包围盒底部 → place.y * H
  const left = Math.round(place.x * W - (bb.left + bb.width / 2) * s);
  const top = Math.round(place.y * H - (bb.top + bb.height) * s);
  // 渲染画布可能比场景大或超出边界：只保留与场景相交的部分
  const cx0 = Math.max(0, left);
  const cy0 = Math.max(0, top);
  const cx1 = Math.min(W, left + rw);
  const cy1 = Math.min(H, top + rh);
  if (cx1 <= cx0 || cy1 <= cy0) throw new Error("产品完全在画面之外，请调整位置或比例");
  const crop = { left: cx0 - left, top: cy0 - top, width: cx1 - cx0, height: cy1 - cy0 };
  const resize = (file: string) => sharp(file).ensureAlpha().resize(rw, rh, { kernel: "lanczos3" }).extract(crop).png().toBuffer();
  const [product, mask] = await Promise.all([resize(productPng), resize(maskPng)]);
  const onCanvas = (layer: Buffer) =>
    sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: layer, left: cx0, top: cy0 }])
      .png()
      .toBuffer();
  const [productLayer, maskLayer] = await Promise.all([onCanvas(product), onCanvas(mask)]);
  let bg = sharp(plate).removeAlpha();
  if (reflection && reflection.strength > 0 && fs.existsSync(reflection.file)) {
    const refl = await sharp(reflection.file)
      .removeAlpha()
      .resize(rw, rh, { kernel: "lanczos3" })
      .extract(crop)
      .linear(reflection.strength, 0)
      .png()
      .toBuffer();
    const reflLayer = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: refl, left: cx0, top: cy0 }])
      .png()
      .toBuffer();
    bg = sharp(await bg.composite([{ input: reflLayer, blend: "screen" }]).png().toBuffer());
  }
  const composite = await bg.composite([{ input: productLayer }]).png().toBuffer();
  const maskGray = await sharp(maskLayer).extractChannel("alpha").png().toBuffer();
  return { composite, mask: maskGray, width: W, height: H, box: { left, top, width: rw, height: rh } };
}

export type ProtectMode = "pixel" | "tone";

/**
 * 把产品贴回 AI 融合结果，返回最终图与 AI 在产品区域试图改动的平均差异（0–255）。
 * - pixel：产品区域逐像素用合成图（渲染）覆盖，连光线也不变。
 * - tone：产品的形状 / 细节 / Logo（高频）来自渲染，光线 / 色温 / 曝光（低频）来自 AI 融合结果；几何同样不会变。
 */
export async function protectProduct(harmonized: Buffer, composite: Buffer, maskGray: Buffer, width: number, height: number, mode: ProtectMode = "tone") {
  const raw = (img: sharp.Sharp) => img.raw().toBuffer();
  const base = sharp(harmonized).resize(width, height, { fit: "fill" }).removeAlpha();
  const comp = sharp(composite).removeAlpha();
  const [a, b, m, aLow, bLow, mSoft] = await Promise.all([
    raw(base.clone()),
    raw(comp.clone()),
    raw(sharp(maskGray).toColourspace("b-w")),
    raw(base.clone().blur(6)),
    raw(comp.clone().blur(6)),
    raw(sharp(maskGray).toColourspace("b-w").blur(0.8)),
  ]);
  const out = Buffer.from(a);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < m.length; i++) {
    const w = mSoft[i] / 255;
    if (w <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const product = mode === "pixel" ? b[j] : Math.max(0, Math.min(255, aLow[j] + (b[j] - bLow[j])));
      out[j] = Math.round(a[j] * (1 - w) + product * w);
    }
    if (m[i] > 128) {
      sum += Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2]);
      n++;
    }
  }
  const final = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { final, aiDrift: n ? sum / (3 * n) : 0, protectedPixels: n };
}
