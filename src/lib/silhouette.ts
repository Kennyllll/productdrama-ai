// 轮廓比对：模型截图和白底照各取一个剪影，裁到外框、按比例缩到同样大小再比重合度（0–1）。
// 用来自动判断模型车头朝向，不花钱。
export const MASK = 48;

/** RGBA 像素 → 剪影；isFg 判断一个像素是不是产品 */
export function maskOf(rgba: ArrayLike<number>, w: number, h: number, isFg: (r: number, g: number, b: number, a: number) => boolean, flipY = false): Uint8Array | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!isFg(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;
      const yy = flipY ? h - 1 - y : y;
      fg[yy * w + x] = 1;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, yy);
      y1 = Math.max(y1, yy);
    }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const k = (MASK - 1) / Math.max(bw, bh);
  const ox = (MASK - bw * k) / 2, oy = (MASK - bh * k) / 2;
  const out = new Uint8Array(MASK * MASK);
  for (let y = 0; y < MASK; y++)
    for (let x = 0; x < MASK; x++) {
      const sx = Math.floor((x - ox) / k) + x0, sy = Math.floor((y - oy) / k) + y0;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && fg[sy * w + sx]) out[y * MASK + x] = 1;
    }
  return out;
}

/** 白底照的产品像素：和四个角的底色差得多 */
export function photoFg(rgba: ArrayLike<number>, w: number, h: number) {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]]);
  const bg = [0, 1, 2].map((c) => corners.reduce((a, x) => a + x[c], 0) / 4);
  return (r: number, g: number, b: number) => Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 60;
}

export function overlap(a: Uint8Array, b: Uint8Array): number {
  let i = 0, u = 0;
  for (let p = 0; p < a.length; p++) {
    if (a[p] && b[p]) i++;
    if (a[p] || b[p]) u++;
  }
  return u ? i / u : 0;
}

export const mirror = (m: Uint8Array) => {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < MASK; y++) for (let x = 0; x < MASK; x++) o[y * MASK + x] = m[y * MASK + MASK - 1 - x];
  return o;
};

export type Yaw = 0 | 90 | -90 | 180;
export const YAWS: Yaw[] = [0, 90, -90, 180];

/** 每个转向角度的平均重合度 → 最可能的转向；差得不明显就当没问题（null = 判断不了） */
export function bestYaw(scores: Record<Yaw, number[]>): { yaw: Yaw; score: number; base: number } | null {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  const base = avg(scores[0]);
  if (!scores[0].length) return null;
  let yaw: Yaw = 0;
  for (const y of YAWS) if (avg(scores[y]) > avg(scores[yaw])) yaw = y;
  if (yaw !== 0 && avg(scores[yaw]) - base < 0.04) yaw = 0;
  return { yaw, score: avg(scores[yaw]), base };
}
