// 产品照片质量（免费，本机算）：太小、太暗、太亮、太糊。阈值偏宽松，只提示，不拦上传。
export interface PhotoStats {
  width: number;
  height: number;
  /** 平均亮度 0–255 */
  brightness: number;
  /** 清晰度：缩到 512 宽后拉普拉斯（边缘）的标准差；越大越清楚 */
  sharpness: number;
}

export const MIN_SIDE = 1000;

export function photoWarnings(p: PhotoStats): string[] {
  const w: string[] = [];
  const side = Math.min(p.width, p.height);
  if (side < MIN_SIDE) w.push(`太小（${p.width}×${p.height}），请用原图，短边至少 ${MIN_SIDE} 像素`);
  if (p.brightness < 60) w.push("太暗：开灯或到窗边重拍");
  else if (p.brightness > 252) w.push("太亮：产品本身也发白、看不清细节，调暗一点重拍（白底是正常的）");
  if (p.sharpness < 4) w.push("有点糊：拿稳手机、对好焦再拍");
  return w;
}

/** 灰度像素 → 平均亮度 + 清晰度（拉普拉斯标准差）。只算产品所在的中间区域，白底不拉低清晰度 */
export function grayStats(px: Uint8Array, w: number, h: number, ch = 1): { brightness: number; sharpness: number } {
  const at = (x: number, y: number) => px[(y * w + x) * ch];
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += px[i * ch];
  let n = 0;
  let s1 = 0;
  let s2 = 0;
  for (let y = Math.max(1, Math.floor(h * 0.1)); y < Math.min(h - 1, Math.ceil(h * 0.9)); y++)
    for (let x = Math.max(1, Math.floor(w * 0.1)); x < Math.min(w - 1, Math.ceil(w * 0.9)); x++) {
      const l = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * at(x, y);
      n++;
      s1 += l;
      s2 += l * l;
    }
  const mean = n ? s1 / n : 0;
  return { brightness: w * h ? sum / (w * h) : 0, sharpness: n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0 };
}
