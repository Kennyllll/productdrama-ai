// 大脑挪机位后的程序校验（免费，本机算）：机位在房间里、不穿家具、离产品够远、产品完整在 9:16 画面里
import type { SetLayout } from "@/lib/production-repo";
import type { P3 } from "@/lib/figures";
import type { SceneItem } from "@/lib/shorts-scenes";
import { itemAt, wallBetween } from "@/lib/stage-rules";

export type Cam = Pick<SetLayout, "camPos" | "lookAt" | "lens">;
export const LENSES = [18, 24, 28, 35, 50, 85];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 点投到竖屏 9:16 画面：x、y 在 [-1, 1] 里就在画面内（中心 0，y 向上）；在相机后面返回 null */
export function project(c: Cam, p: P3): [number, number] | null {
  const f = [c.lookAt[0] - c.camPos[0], c.lookAt[1] - c.camPos[1], c.lookAt[2] - c.camPos[2]];
  const fl = Math.hypot(f[0], f[1], f[2]) || 1;
  const F = f.map((x) => x / fl);
  const rl = Math.hypot(F[1], F[0]) || 1;
  const R = [F[1] / rl, -F[0] / rl, 0];
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  const v = [p[0] - c.camPos[0], p[1] - c.camPos[1], p[2] - c.camPos[2]];
  const d = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
  if (d < 0.05) return null;
  const x = (v[0] * R[0] + v[1] * R[1]) / d / (18 / c.lens);
  const y = (v[0] * U[0] + v[1] * U[1] + v[2] * U[2]) / d / (32 / c.lens);
  return [x, y];
}

const inFrame = (c: Cam, pts: P3[], m = 0.95) =>
  pts.every((p) => {
    const q = project(c, p);
    return q !== null && Math.abs(q[0]) <= m && Math.abs(q[1]) <= m;
  });

export interface CamScene {
  bike?: [number, number];
  bikeYaw: number;
  /** 产品长、高（米） */
  len: number;
  h: number;
  items: SceneItem[];
  people: { name: string; x: number; y: number; h: number }[];
}

/** 产品外框的 8 个角（车头沿 [-sin, cos]，宽按长的 0.45 估） */
export function productPts(s: CamScene): P3[] {
  if (!s.bike) return [];
  const a = (s.bikeYaw * Math.PI) / 180;
  const b = [-Math.sin(a), Math.cos(a)];
  const side = [b[1], -b[0]];
  const L = s.len / 2;
  const W = (s.len * 0.45) / 2;
  const out: P3[] = [];
  for (const u of [-L, L]) for (const w of [-W, W]) for (const z of [0.02, s.h]) out.push([s.bike[0] + b[0] * u + side[0] * w, s.bike[1] + b[1] * u + side[1] * w, z]);
  return out;
}

/**
 * 校验大脑给的机位：能自动修的（墙外挪回屋里、离太近往后拉、产品出画往后拉）直接修好写进 fixes；
 * 修不好的写进 errors，cam = null 表示不采用这个机位。
 */
export function checkCam(raw: Cam, s: CamScene): { cam: Cam | null; fixes: string[]; errors: string[] } {
  const fixes: string[] = [];
  const errors: string[] = [];
  const lens = LENSES.reduce((a, b) => (Math.abs(b - raw.lens) < Math.abs(a - raw.lens) ? b : a), 28);
  if (lens !== raw.lens) fixes.push(`焦段 ${raw.lens}mm 改成最接近的 ${lens}mm`);
  const z = Math.max(0.2, Math.min(2.2, raw.camPos[2]));
  if (z !== raw.camPos[2]) fixes.push(`机位高度 ${r2(raw.camPos[2])} 米超出范围，改成 ${r2(z)} 米`);
  let c: Cam = { lens, camPos: [raw.camPos[0], raw.camPos[1], z], lookAt: [raw.lookAt[0], raw.lookAt[1], Math.max(0, Math.min(2, raw.lookAt[2]))] };
  const blockedAt = () => wallBetween([c.camPos[0], c.camPos[1]], z, s.items) || itemAt([c.camPos[0], c.camPos[1]], z, s.items);
  const wall = wallBetween([c.camPos[0], c.camPos[1]], z, s.items);
  if (wall) {
    c = { ...c, camPos: [wall.inside[0], wall.inside[1], z] };
    fixes.push("机位在墙外，挪回屋里");
  }
  const [bx, by] = s.bike ?? [c.lookAt[0], c.lookAt[1]];
  const away = () => {
    const dx = c.camPos[0] - bx;
    const dy = c.camPos[1] - by;
    const n = Math.hypot(dx, dy);
    return n > 1e-6 ? ([dx / n, dy / n, n] as const) : ([0, -1, 0] as const);
  };
  const back = (m: number) => {
    const [ux, uy] = away();
    c = { ...c, camPos: [r2(c.camPos[0] + ux * m), r2(c.camPos[1] + uy * m), z] };
  };
  if (s.bike && away()[2] < 0.6) {
    back(0.6 - away()[2]);
    fixes.push("机位离产品不到 0.6 米，往后拉到 0.6 米");
  }
  const pts = productPts(s);
  if (pts.length && !inFrame(c, pts)) {
    let moved = 0;
    while (moved < 2 && !inFrame(c, pts) && !blockedAt()) {
      back(0.1);
      moved += 0.1;
    }
    if (inFrame(c, pts) && !blockedAt()) fixes.push(`产品会被画面裁掉，往后拉了 ${r2(moved)} 米`);
    else errors.push("这个机位拍不全产品（往后拉也拍不全，或会撞墙 / 家具），机位没改");
  }
  const hit = itemAt([c.camPos[0], c.camPos[1]], z, s.items);
  if (hit && !errors.length) errors.push("机位会穿进家具，机位没改");
  if (errors.length) return { cam: null, fixes, errors };
  for (const p of s.people)
    if (!inFrame(c, [[p.x, p.y, Math.max(0.3, p.h * 0.85)]], 1)) fixes.push(`${p.name} 的头在画面外，看一下是不是故意的（真实广告里大人常只露手和半边身子）`);
  return { cam: { ...c, lookAt: [r2(c.lookAt[0]), r2(c.lookAt[1]), r2(c.lookAt[2])] }, fixes, errors };
}

/** 3D 页实时检查当前机位：每条问题带一句写好的要求，点「让大脑修好」直接交给大脑 */
export function camProblems(c: Cam, s: CamScene): { msg: string; ask: string }[] {
  const out: { msg: string; ask: string }[] = [];
  const keep = "人和产品的位置保持原样";
  const z = c.camPos[2];
  if (wallBetween([c.camPos[0], c.camPos[1]], z, s.items)) out.push({ msg: "机位在墙外", ask: `机位在墙外：把机位挪回屋里，拍全产品；${keep}` });
  else if (itemAt([c.camPos[0], c.camPos[1]], z, s.items)) out.push({ msg: "机位穿进了家具", ask: `机位穿进了家具：把机位挪到空地上，拍全产品；${keep}` });
  if (!s.bike) return out;
  const dist = Math.hypot(c.camPos[0] - s.bike[0], c.camPos[1] - s.bike[1]);
  if (dist < 0.6) out.push({ msg: `机位离产品只有 ${r2(dist)} 米，太近`, ask: `机位离产品太近：往后拉到至少 0.6 米，拍全产品；${keep}` });
  const pts = productPts(s);
  const q = pts.map((p) => project(c, p));
  if (!inFrame(c, pts, 1)) out.push({ msg: "产品被画面裁掉了", ask: `产品被画面裁掉了：镜头拉远或换个角度，让整个产品完整入画；${keep}` });
  else if (q.every(Boolean)) {
    const ys = q.map((v) => (v as [number, number])[1]);
    const xs = q.map((v) => (v as [number, number])[0]);
    if (Math.max(Math.max(...ys) - Math.min(...ys), (Math.max(...xs) - Math.min(...xs)) * (9 / 16)) < 0.5)
      out.push({ msg: "产品在画面里太小", ask: `产品在画面里太小：镜头拉近一点或换焦段，让产品更大，但要完整入画；${keep}` });
  }
  const [bx, by] = s.bike;
  const sx = bx - c.camPos[0];
  const sy = by - c.camPos[1];
  const sl = Math.hypot(sx, sy) || 1;
  for (const p of s.people) {
    const t = ((p.x - c.camPos[0]) * sx + (p.y - c.camPos[1]) * sy) / (sl * sl);
    if (t <= 0.05 || t >= 0.8) continue;
    const off = Math.abs((p.x - c.camPos[0]) * sy - (p.y - c.camPos[1]) * sx) / sl;
    if (off < 0.25) out.push({ msg: `${p.name} 挡在镜头和产品中间`, ask: `${p.name} 挡住了产品：挪一下 ${p.name} 的站位或换个机位，让产品完整露出来；产品保持原样` });
  }
  return out;
}
