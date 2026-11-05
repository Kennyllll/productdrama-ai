import sharp from "sharp";

const SW = 384;

async function edges(src: string | Buffer, w: number, h: number): Promise<Float32Array> {
  const g = await sharp(src).removeAlpha().resize(w, h, { fit: "fill" }).greyscale().blur(1.2).raw().toBuffer();
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i + 1 - w] + 2 * g[i + 1] + g[i + 1 + w] - g[i - 1 - w] - 2 * g[i - 1] - g[i - 1 + w];
      const gy = g[i - 1 + w] + 2 * g[i + w] + g[i + 1 + w] - g[i - 1 - w] - 2 * g[i - w] - g[i + 1 - w];
      e[i] = Math.hypot(gx, gy);
    }
  return e;
}

/**
 * AI 写实化后是否保住了布景的机位：布景（无车底图）里最强的结构边（墙脚线、墙角、门框）
 * 在 AI 图里同一位置附近（±2 px，384 宽）是否还有边。产品区域不算（AI 不该画车，那里只有影子）。
 * recall 低 = AI 换了机位 / 重排了布景，真车按原机位贴回会悬空或比例错。
 */
export async function layoutRecall(plate: string | Buffer, ai: Buffer, productMask?: string): Promise<number> {
  const m = await sharp(plate).metadata();
  const w = SW, h = Math.round((SW * (m.height ?? 1)) / (m.width ?? 1));
  const [ep, ea] = await Promise.all([edges(plate, w, h), edges(ai, w, h)]);
  const skip = productMask
    ? await sharp(productMask).ensureAlpha().extractChannel(3).resize(w, h, { fit: "fill" }).blur(3).raw().toBuffer()
    : null;
  const vals = Array.from(ep).filter((v, i) => v > 0 && !(skip && skip[i] > 8)).sort((a, b) => b - a);
  const thr = Math.max(40, vals[Math.floor(vals.length * 0.03)] ?? 40);
  const aVals = Array.from(ea).sort((a, b) => b - a);
  const athr = Math.max(25, (aVals[Math.floor(aVals.length * 0.12)] ?? 25));
  let n = 0, hit = 0;
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (ep[i] < thr || (skip && skip[i] > 8)) continue;
      n++;
      let ok = false;
      for (let dy = -2; dy <= 2 && !ok; dy++) for (let dx = -2; dx <= 2 && !ok; dx++) if (ea[i + dy * w + dx] >= athr) ok = true;
      if (ok) hit++;
    }
  return n ? hit / n : 0;
}
