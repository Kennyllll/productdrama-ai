// 手持晃动（出片时加）：视频模型不听「手抖」，生成的镜头像三脚架一样平滑地飘。
// 按「手持微晃」的轻 / 中 / 强，用 ffmpeg 加手机手持的晃动：慢漂 + 呼吸起伏 + 轻微手颤 + 一次小幅调整构图。
// 同一镜头每次出片晃法一样（按镜头 id 定随机数）。

function rand(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 轻 / 中 / 强 → 晃动幅度倍数 */
export const shakeScale = (amount: number) => (amount > 0.66 ? 1 : amount > 0.33 ? 0.6 : 0.33);

/** 接在已经缩放裁好 w×h 的画面后面的 ffmpeg 滤镜 */
export function handheldFilters(seed: string, amount: number, w = 1080, h = 1920): string[] {
  const r = rand(seed);
  const k = shakeScale(amount);
  const band = (lo: number, hi: number, amp: number, n = 5) =>
    Array.from({ length: n }, () => `${(amp / Math.sqrt(n)).toFixed(4)}*sin(${(2 * Math.PI * (lo + r() * (hi - lo))).toFixed(3)}*t+${(r() * 6.28).toFixed(2)})`).join("+");
  const axis = (s: number) => {
    const t0 = 0.8 + r() * 2.2;
    const d = (r() + r() + r() - 1.5) * 2 * 0.012 * s;
    return `(${band(0.15, 0.6, 0.012 * s)}+${band(0.8, 2, 0.004 * s)}+${band(5, 10, 0.0012 * s)}+${d.toFixed(3)}/(1+exp(-(t-${t0.toFixed(2)})/0.06)))`;
  };
  const z = 1 + 0.06 * k;
  const even = (x: number) => Math.round(x / 2) * 2;
  return [
    `scale=${even(w * z)}:${even(h * z)}`,
    `rotate='(${axis(k)})*0.6':ow=iw:oh=ih`,
    `crop=${w}:${h}:x='(iw-${w})/2+${axis(w * k)}':y='(ih-${h})/2+${axis(h * 0.8 * k)}'`,
  ];
}
