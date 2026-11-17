// 从模型外形自动量接触点（座椅、两个握把、两只脚）；纯计算，浏览器和服务器都能用
import { estimateRig, type ProductRig, type RideKind } from "@/lib/figures";

const r = (v: number) => Math.round(v * 1000) / 1000;

/**
 * pts：xyz 交错的顶点，产品本地坐标（车头朝 -x，地面 y = 0，模型中心 x = z = 0）。
 * 量不出来就退回按这个类型的比例估算（auto = false）。
 */
export function measureRig(pts: ArrayLike<number>, kind: RideKind): { rig: ProductRig; auto: boolean } {
  const n = Math.floor(pts.length / 3);
  let x0 = Infinity, x1 = -Infinity, H = 0, W = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = Math.abs(pts[i * 3 + 2]);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y > H) H = y;
    if (z > W) W = z;
  }
  W *= 2;
  const L = x1 - x0;
  const guess = estimateRig(L, W, H, kind);
  if (kind === "other" || !(L > 0 && W > 0 && H > 0)) return { rig: guess, auto: false };

  // 车把：前半段最高的那一层，取左右两端
  let zt = 0;
  for (let i = 0; i < n; i++) if (pts[i * 3 + 1] > 0.85 * H && pts[i * 3] < 0) zt = Math.max(zt, Math.abs(pts[i * 3 + 2]));
  if (zt < 0.15 * W) return { rig: guess, auto: false };
  let gx = 0, gy = 0, gz = 0, gn = 0;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = Math.abs(pts[i * 3 + 2]);
    if (y > 0.85 * H && x < 0 && z > 0.6 * zt) { gx += x; gy += y; gz += z; gn++; }
  }
  gx /= gn; gy /= gn; gz /= gn;

  // 座椅：车把后面、比车架宽的一段；三轮车取最低（靠背前的座面），平衡车取最高（车座顶）
  const step = 0.03 * L;
  const from = gx + 0.1 * L, to = 0.35 * L;
  const bins = Math.max(1, Math.ceil((to - from) / step));
  const wide = new Array<number>(bins).fill(0);
  const top = new Array<number>(bins).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = Math.abs(pts[i * 3 + 2]);
    if (x < from || x >= to || y < 0.3 * H || y > 0.85 * H) continue;
    const b = Math.min(bins - 1, Math.floor((x - from) / step));
    wide[b] = Math.max(wide[b], z);
    if (z < 0.08 * W) top[b] = Math.max(top[b], y);
  }
  let seat = -1;
  for (let b = 0; b < bins; b++) {
    if (wide[b] * 2 < 0.15 * W || !Number.isFinite(top[b])) continue;
    if (seat < 0 || (kind === "tricycle" ? top[b] < top[seat] : top[b] > top[seat])) seat = b;
  }
  if (seat < 0) return { rig: guess, auto: false };
  // 平衡车车座是一段弧面：取接近最高的几格的中间
  let seatX = from + (seat + 0.5) * step;
  if (kind === "balance") {
    let sx = 0, sn = 0;
    for (let b = 0; b < bins; b++) if (wide[b] * 2 >= 0.15 * W && top[b] >= top[seat] - 0.04 * H) { sx += from + (b + 0.5) * step; sn++; }
    seatX = sx / sn;
  }
  const rig: ProductRig = { ...guess, seatBack: r(seatX), seatY: r(top[seat]), gripX: r(gz), gripY: r(gy), gripFwd: r(-gx) };

  // 三轮车的脚踏：前半段、低处、最往外伸的小块
  if (kind === "tricycle") {
    let zl = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1];
      if (x < 0 && y > 0.03 * H && y < 0.45 * H) zl = Math.max(zl, Math.abs(pts[i * 3 + 2]));
    }
    if (zl < 0.2 * W) return { rig, auto: true };
    let fx = 0, fz = 0, fy = 0, fn = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = Math.abs(pts[i * 3 + 2]);
      if (x < 0 && y > 0.03 * H && y < 0.45 * H && z > 0.6 * zl) { fx += x; fz += z; fy = Math.max(fy, y); fn++; }
    }
    Object.assign(rig, { footFwd: r(-fx / fn), footX: r(fz / fn), footY: r(fy) });
  }
  return { rig, auto: true };
}
