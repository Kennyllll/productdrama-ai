/**
 * 3D 场景匹配：从空场景的几何线索（墙脚线、已知高度的参照物、地平线）解出相机，
 * 相机在 (0, 0, h)、朝 +Y、向下俯 pitch；地面 z = 0。单位：米 / 像素。
 */
export interface Px { x: number; y: number }
export interface SceneGeom {
  horizonY: number | null;
  wallBase: [Px, Px];
  clearSpan: [Px, Px] | null;
  sideBase: [Px, Px] | null;
  refs: { name: string; heightM: number; top: Px; bottom: Px }[];
}
export interface SceneCamera { lensMm: number; heightM: number; pitchDeg: number; err: number }
type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function basis(pitchDeg: number) {
  const p = (pitchDeg * Math.PI) / 180, s = Math.sin(p), c = Math.cos(p);
  return { F: [0, c, -s] as V3, U: [0, s, c] as V3, R: [1, 0, 0] as V3 };
}

export function floorHit(pt: Px, W: number, H: number, cam: SceneCamera): V3 | null {
  const { F, U, R } = basis(cam.pitchDeg);
  const f = (cam.lensMm / 36) * W;
  const a = (pt.x - W / 2) / f, b = (pt.y - H / 2) / f;
  const d: V3 = [F[0] + a * R[0] - b * U[0], F[1] + a * R[1] - b * U[1], F[2] + a * R[2] - b * U[2]];
  if (d[2] >= -1e-6) return null;
  const t = -cam.heightM / d[2];
  return [t * d[0], t * d[1], 0];
}

export function project(p: V3, W: number, H: number, cam: SceneCamera): Px | null {
  const { F, U, R } = basis(cam.pitchDeg);
  const q: V3 = [p[0], p[1], p[2] - cam.heightM];
  const z = dot(q, F);
  if (z <= 1e-6) return null;
  const f = (cam.lensMm / 36) * W;
  return { x: W / 2 + (f * dot(q, R)) / z, y: H / 2 - (f * dot(q, U)) / z };
}

function cost(g: SceneGeom, W: number, H: number, cam: SceneCamera): number {
  let e = 0;
  for (const r of g.refs) {
    const P = floorHit(r.bottom, W, H, cam);
    const t = P && project([P[0], P[1], r.heightM], W, H, cam);
    e += t ? ((t.y - r.top.y) / H) ** 2 : 1;
  }
  if (g.horizonY != null) {
    const f = (cam.lensMm / 36) * W;
    e += 0.3 * ((H / 2 - f * Math.tan((cam.pitchDeg * Math.PI) / 180) - g.horizonY) / H) ** 2;
  }
  // 后墙脚线与侧墙脚线在地面上应互相垂直：约束焦距
  if (g.sideBase) {
    const dir = (l: [Px, Px]) => {
      const a = floorHit(l[0], W, H, cam), b = floorHit(l[1], W, H, cam);
      if (!a || !b) return null;
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
      return [dx / n, dy / n];
    };
    const a = dir(g.wallBase), b = dir(g.sideBase);
    e += a && b ? 0.05 * (a[0] * b[0] + a[1] * b[1]) ** 2 : 0.05;
  }
  // 墙脚线必须落在相机前方的地面上
  for (const p of g.wallBase) if (!floorHit(p, W, H, cam)) e += 1;
  return e;
}

export function solveCamera(g: SceneGeom, W: number, H: number, lensHint = 35): SceneCamera {
  const lenses = [...new Set([18, 24, 28, 35, 50, 65, lensHint])];
  let best: SceneCamera = { lensMm: lensHint, heightM: 1, pitchDeg: 5, err: Infinity };
  for (const lensMm of lenses)
    for (let pitchDeg = -15; pitchDeg <= 40; pitchDeg += 0.25)
      for (let heightM = 0.12; heightM <= 2.6; heightM += 0.02) {
        const cam = { lensMm, heightM, pitchDeg, err: 0 };
        const e = cost(g, W, H, cam) + (g.sideBase ? 0 : 1e-4 * Math.abs(lensMm - lensHint) / 10);
        if (e < best.err) best = { ...cam, err: e };
      }
  return best;
}

/** 墙在地面上的线：点 a、方向 dir、指向相机一侧的法线 normal；place = 车靠墙的位置（空白段中点） */
export function wallFrame(g: SceneGeom, W: number, H: number, cam: SceneCamera) {
  const a = floorHit(g.wallBase[0], W, H, cam), b = floorHit(g.wallBase[1], W, H, cam);
  if (!a || !b) return null;
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const n = Math.hypot(dx, dy) || 1;
  dx /= n; dy /= n;
  let nx = -dy, ny = dx;
  if (nx * -a[0] + ny * -a[1] < 0) { nx = -nx; ny = -ny; }
  const span = g.clearSpan ?? g.wallBase;
  const m = floorHit({ x: (span[0].x + span[1].x) / 2, y: (span[0].y + span[1].y) / 2 }, W, H, cam) ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
  const t = (m[0] - a[0]) * dx + (m[1] - a[1]) * dy;
  return { a: [a[0], a[1]], dir: [dx, dy], normal: [nx, ny], place: [a[0] + dx * t, a[1] + dy * t] };
}
