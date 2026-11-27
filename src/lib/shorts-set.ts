// 短视频场地地图与机位：场地预设、按分镜自动摆机位、运镜（纯函数，客户端和服务端共用）。
// 坐标沿用 Blender：x 东、y 北、z 上，单位米；产品默认放在原点。
import type { SetLayout, SetMove, SetProp } from "@/lib/production-repo";
import { cleanFigures } from "@/lib/figures";
import { parseOp, poseOf } from "@/lib/shorts-operator";

type V3 = [number, number, number];
const box = (lo: V3, hi: V3, rgb: V3): SetProp => ({ lo, hi, rgb });

const WALL: V3 = [0.86, 0.84, 0.8];
const FLOOR_RUG: V3 = [0.62, 0.55, 0.47];
const SOFA: V3 = [0.45, 0.47, 0.5];
const WOOD: V3 = [0.5, 0.36, 0.24];
const TREE: V3 = [0.16, 0.4, 0.2];
const GIFT: V3 = [0.75, 0.15, 0.15];

const roomWalls = [box([-3.1, 3, 0], [3.1, 3.1, 2.6], WALL), box([-3.1, -3, 0], [-3, 3, 2.6], WALL), box([3, -3, 0], [3.1, 3, 2.6], WALL)];

export interface SetRoom {
  id: string;
  label: string;
  props: SetProp[];
}

export const SET_ROOMS: SetRoom[] = [
  {
    id: "xmas-living",
    label: "圣诞客厅",
    props: [
      ...roomWalls,
      box([-2.2, -1.6, 0], [2.2, 1.9, 0.01], FLOOR_RUG),
      box([-1.6, 2.1, 0], [1.6, 3, 0.85], SOFA),
      box([-0.6, 1.1, 0], [0.6, 1.6, 0.42], WOOD),
      box([1.9, 1.9, 0], [2.8, 2.8, 2.1], TREE),
      box([1.5, 1.4, 0], [1.85, 1.75, 0.3], GIFT),
      box([2.3, 1.3, 0], [2.6, 1.6, 0.22], [0.2, 0.35, 0.7]),
    ],
  },
  {
    id: "living",
    label: "客厅",
    props: [
      ...roomWalls,
      box([-2.2, -1.6, 0], [2.2, 1.9, 0.01], FLOOR_RUG),
      box([-1.6, 2.1, 0], [1.6, 3, 0.85], SOFA),
      box([-0.6, 1.1, 0], [0.6, 1.6, 0.42], WOOD),
      box([-3, -1, 0], [-2.55, 1, 0.6], WOOD),
    ],
  },
  {
    id: "kids-room",
    label: "儿童房",
    props: [...roomWalls, box([-2.2, -1.5, 0], [2.2, 1.5, 0.01], [0.55, 0.65, 0.75]), box([-3, 1.2, 0], [-1.6, 3, 0.55], [0.85, 0.85, 0.9]), box([2.55, -1.2, 0], [3, 1.2, 1.4], WOOD)],
  },
  {
    id: "driveway",
    label: "车道 / 前院",
    props: [
      box([-2, 4, 0], [2, 4.2, 2.6], [0.92, 0.92, 0.9]),
      box([-6, 4.2, 0], [6, 9, 3.2], [0.75, 0.68, 0.6]),
      box([-2, -6, 0], [2, 4, 0.01], [0.62, 0.62, 0.6]),
      box([2, -6, 0], [8, 4, 0.02], [0.36, 0.52, 0.26]),
      box([-8, -6, 0], [-2, 4, 0.02], [0.36, 0.52, 0.26]),
      box([4, 1, 0], [5.5, 2.5, 3.5], TREE),
    ],
  },
  {
    id: "park",
    label: "公园小路",
    props: [box([-1, -12, 0], [1, 12, 0.01], [0.66, 0.6, 0.5]), box([2.5, -2, 0], [4, -0.5, 4], TREE), box([-4.5, 3, 0], [-3, 4.5, 4.5], TREE), box([-3, -3, 0], [-1.6, -2.5, 0.45], WOOD)],
  },
];

export const findRoom = (id: string | undefined) => SET_ROOMS.find((r) => r.id === id) ?? SET_ROOMS[1];

/** 按创意的场景描述猜一个场地 */
export function guessRoom(setting: string): string {
  const s = setting.toLowerCase();
  if (/圣诞|christmas|xmas|节日/.test(s)) return "xmas-living";
  if (/车道|前院|driveway|院子|yard|街|sidewalk/.test(s)) return "driveway";
  if (/公园|park|小路|trail/.test(s)) return "park";
  if (/卧室|儿童房|bedroom|kids room/.test(s)) return "kids-room";
  return "living";
}

export const MOVES: { id: SetMove["kind"]; label: string }[] = [
  { id: "static", label: "固定" },
  { id: "handheld", label: "手持微晃" },
  { id: "push", label: "推近" },
  { id: "pull", label: "拉远" },
  { id: "orbitL", label: "向左环绕" },
  { id: "orbitR", label: "向右环绕" },
  { id: "rise", label: "升高" },
  { id: "lower", label: "降低" },
];

/** 手持微晃预演：第 sec 秒的机位 */
export function shakeLayout(l: SetLayout, sec: number): SetLayout {
  const a = 0.015 + 0.06 * Math.min(1, Math.max(0, l.move?.amount ?? 0.3));
  const w = (f: number, p: number) => Math.sin(sec * f + p) + 0.5 * Math.sin(sec * f * 2.3 + p * 1.7);
  return {
    ...l,
    camPos: [l.camPos[0] + a * w(5.1, 0), l.camPos[1] + a * w(4.3, 1), l.camPos[2] + 0.7 * a * w(6.7, 2)],
    lookAt: [l.lookAt[0] + 0.6 * a * w(3.7, 3), l.lookAt[1] + 0.6 * a * w(4.9, 4), l.lookAt[2] + 0.6 * a * w(5.9, 5)],
  };
}

/** 运镜落幅：起幅 = layout 本身 */
export function moveEnd(l: SetLayout): SetLayout {
  const m = l.move;
  if (!m || m.kind === "static" || m.kind === "handheld") return l;
  const a = Math.min(1, Math.max(0, m.amount));
  const [cx, cy, cz] = l.camPos;
  const [tx, ty] = l.lookAt;
  const dx = cx - tx;
  const dy = cy - ty;
  switch (m.kind) {
    case "push":
      return { ...l, camPos: [tx + dx * (1 - 0.6 * a), ty + dy * (1 - 0.6 * a), cz] };
    case "pull":
      return { ...l, camPos: [tx + dx * (1 + a), ty + dy * (1 + a), cz] };
    case "orbitL":
    case "orbitR": {
      const t = ((m.kind === "orbitL" ? -1 : 1) * 70 * a * Math.PI) / 180;
      return { ...l, camPos: [tx + dx * Math.cos(t) - dy * Math.sin(t), ty + dx * Math.sin(t) + dy * Math.cos(t), cz] };
    }
    case "rise":
      return { ...l, camPos: [cx, cy, cz + 1.5 * a] };
    case "lower":
      return { ...l, camPos: [cx, cy, Math.max(0.1, cz - 1.5 * a)] };
  }
}

export const lerpLayout = (a: SetLayout, b: SetLayout, t: number): SetLayout => {
  const f = (x: number, y: number) => x + (y - x) * t;
  const v = (p: V3, q: V3): V3 => [f(p[0], q[0]), f(p[1], q[1]), f(p[2], q[2])];
  return { ...a, camPos: v(a.camPos, b.camPos), lookAt: v(a.lookAt, b.lookAt), lens: f(a.lens, b.lens) };
};

/** 写进视频提示词的运镜（英文） */
export function moveText(l: SetLayout | null | undefined): string {
  const m = l?.move;
  if (!m) return "";
  const amt = m.amount > 0.66 ? "strong" : m.amount > 0.33 ? "moderate" : "slight";
  const map: Record<SetMove["kind"], string> = {
    static: "Camera: locked off, no camera movement.",
    handheld: "Camera: a parent holds the phone at this angle for the whole clip; the camera does not zoom, push in, pan or drift.",
    push: `Camera: ${amt} slow push-in toward the subject.`,
    pull: `Camera: ${amt} slow pull-back away from the subject.`,
    orbitL: `Camera: ${amt} orbit to the left around the subject, keeping it centered.`,
    orbitR: `Camera: ${amt} orbit to the right around the subject, keeping it centered.`,
    rise: `Camera: ${amt} crane up while looking at the subject.`,
    lower: `Camera: ${amt} lower down toward the subject.`,
  };
  return map[m.kind];
}

const CAMERA_MOVE =
  /\b(push(es|ed|ing)?[- ]?in|pull(s|ed|ing)?[- ]?(back|out)|zoom(s|ed|ing)?|dolly|dollies|orbit(s|ed|ing)?|crane(s|d)?|tracking shot|camera (slowly |gently )?(moves|glides|drifts|circles|rotates|follows|rises|lowers|pushes|pulls|tracks|pans|tilts))\b/i;

/** 运镜只听「运镜」选项：动作文字里写的推近、环绕等删掉。两边打架时（镜头不让动又要推近），模型会让产品自己动 */
export function dropCameraMoves(text: string): string {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sen) =>
      sen
        .split(/,\s*/)
        .filter((c) => !CAMERA_MOVE.test(c))
        .join(", ")
        .trim(),
    )
    .filter((x) => x && !/^[.,!?\s]+$/.test(x))
    .map((x) => (/[.!?]$/.test(x) ? x : `${x}.`))
    .join(" ");
}

/** 写进首帧提示词的机位（英文），和 3D 构图图一起交给 AI */
export function layoutText(l: SetLayout): string {
  // 和 3D 摆位描述同一算法：产品中部（离地 0.3 米）沿镜头方向的深度
  const t = l.bike ? [l.bike[0], l.bike[1], 0.3] : l.lookAt;
  const f = [0, 1, 2].map((k) => l.lookAt[k] - l.camPos[k]);
  const fn = Math.hypot(f[0], f[1], f[2]) || 1;
  const d = [0, 1, 2].reduce((acc, k) => acc + (t[k] - l.camPos[k]) * (f[k] / fn), 0);
  const size = d < 1.2 ? "close-up" : d < 2 ? "medium close shot" : d < 3.2 ? "medium shot" : "wide shot";
  const h = l.camPos[2] < 0.6 ? "low angle near the floor" : l.camPos[2] > 1.7 ? "high angle looking down" : "eye level";
  return [`Camera: ${Math.round(l.lens)}mm, ${size}, ${h}, about ${l.camPos[2].toFixed(1)} m above the floor, about ${d.toFixed(1)} m from the product.`, facingText(l), l.move?.kind === "handheld" ? "Handheld phone snapshot: horizon tilted a couple of degrees, framing slightly off-center, a touch of motion blur on fast-moving hands." : ""].filter(Boolean).join(" ");
}

/** 本镜机位相对产品的角度，换算成 render_product.py 的参数（az -90 正前、0 左侧、90 正后、180 右侧） */
export function productAngle(l: SetLayout): { azimuth_deg: number; elevation_deg: number; roll_deg: number; pitch_deg: number } {
  const yaw = ((l.bikeYaw ?? 0) * Math.PI) / 180;
  const b = [-Math.sin(yaw), Math.cos(yaw)];
  const [bx, by] = l.bike ?? [0, 0];
  const cx = l.camPos[0] - bx;
  const cy = l.camPos[1] - by;
  const phi = (Math.atan2(cy * b[0] - cx * b[1], cx * b[0] + cy * b[1]) * 180) / Math.PI;
  const el = (Math.atan2(l.camPos[2] - l.lookAt[2], Math.hypot(cx, cy)) * 180) / Math.PI;
  return { azimuth_deg: Math.round(phi - 90), elevation_deg: Math.round(Math.max(2, el)), roll_deg: Math.round(l.bikeRoll ?? 0), pitch_deg: Math.round(l.bikePitch ?? 0) };
}

/** 产品在画面里的朝向（按 3D 构图算；KB002 模型实测：朝向 0° 车头朝 +y） */
export function productView(l: SetLayout): { kind: "head" | "front34" | "side" | "rear34" | "rear"; lr: "left" | "right" } | null {
  if (!l.bike) return null;
  const yaw = ((l.bikeYaw ?? 0) * Math.PI) / 180;
  const b = [-Math.sin(yaw), Math.cos(yaw)];
  const fx = l.lookAt[0] - l.camPos[0];
  const fy = l.lookAt[1] - l.camPos[1];
  const n = Math.hypot(fx, fy) || 1;
  const along = (b[0] * fx + b[1] * fy) / n;
  const side = (b[0] * fy - b[1] * fx) / n;
  const a = Math.abs((Math.atan2(side, -along) * 180) / Math.PI);
  return { kind: a < 22.5 ? "head" : a < 67.5 ? "front34" : a < 112.5 ? "side" : a < 157.5 ? "rear34" : "rear", lr: side > 0 ? "right" : "left" };
}

export function facingText(l: SetLayout): string {
  const pv = productView(l);
  if (!pv) return "";
  const lr = pv.lr;
  const view = {
    head: "head-on, its front end facing the camera",
    front34: `front three-quarter view, its front end pointing toward the camera and to frame ${lr}`,
    side: `pure side profile, its front end pointing to frame ${lr}, showing its ${lr} side`,
    rear34: `rear three-quarter view, its front end pointing away from the camera and to frame ${lr}`,
    rear: "seen from behind, its front end pointing away from the camera",
  }[pv.kind];
  return `Product orientation (exactly as in the 3D blocking, never mirrored or turned): ${view}.`;
}

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

/** 按分镜文字自动摆一个起始机位（之后用户在 3D 布景里拖） */
const rd = (x: number) => Math.round(x * 100) / 100;
/** 正文镜头按真实手机广告构图对准主体：摄影机方向不变，拉到产品和旁边的人占画面一半左右、车轮着地点在画面约 85% 高度；机位不高于 0.8 米（拍的人蹲着或弯腰） */
export function frameShot(l: SetLayout, minH = 0): Pick<SetLayout, "camPos" | "lookAt"> {
  const [bx, by] = l.bike ?? [0, 0];
  const figs = l.figures ?? [];
  const tan = 32 / l.lens;
  const h = figs.some((f) => f.onProduct) ? 1 : figs.some((f) => !f.onProduct && f.kind !== "adult") ? 0.95 : 0.6;
  const n = Math.hypot(l.camPos[0] - bx, l.camPos[1] - by);
  let [ux, uy] = n > 1e-6 ? [(l.camPos[0] - bx) / n, (l.camPos[1] - by) / n] : [0, -1];
  // 有人骑车时不拍背影：转到车头斜前方 40°（同一侧），看得到孩子的脸和车头
  const yr = ((l.bikeYaw ?? 0) * Math.PI) / 180;
  const head = [-Math.sin(yr), Math.cos(yr)];
  if (figs.some((f) => f.onProduct) && ux * head[0] + uy * head[1] < 0.3) {
    const right = [head[1], -head[0]];
    const sd = ux * right[0] + uy * right[1] >= 0 ? 1 : -1;
    const c = Math.cos((40 * Math.PI) / 180);
    const si = Math.sin((40 * Math.PI) / 180) * sd;
    [ux, uy] = [head[0] * c + right[0] * si, head[1] * c + right[1] * si];
  }
  // 旁边的人中心进画面就行（按横向偏移算，站在车后面的人不用拉远）：真实广告里大人常只露半边身子、手和腿
  const half = Math.max(0.45, ...figs.filter((f) => !f.onProduct).map((f) => Math.abs(f.dx * uy - f.dy * ux)));
  const d = Math.max(0.6, h / (0.5 * 2 * tan), half / (18 / l.lens));
  // 拍的人站着时手机不会低于胸口（minH）
  const camH = Math.max(minH, Math.min(l.camPos[2], 0.8));
  const off = Math.atan((0.85 - 0.5) * 2 * tan);
  const z = Math.min(camH, Math.max(0.2, camH - d * Math.tan(Math.atan(camH / d) - off)));
  return { camPos: [rd(bx + ux * d), rd(by + uy * d), rd(camH)], lookAt: [bx, by, rd(z)] };
}

export function autoLayout(shot: { camera: string; description: string; operator?: string }, index: number): SetLayout {
  const t = `${shot.camera} ${shot.description}`;
  // 没写高低机位就按拍摄者姿势的手机高度（站着 1.5 米、蹲着 0.75 米……），和机位检查一致
  const op = parseOp(shot.operator);
  const [dist, lens] = has(t, /特写|close-up|closeup|macro/) ? [0.9, 50] : has(t, /近景/) ? [1.5, 35] : has(t, /全景|远景|wide|establish/) ? [4, 24] : [1.6, 28];
  const camH = has(t, /低机位|低角度|地面|low angle|floor|蹲/) ? 0.35 : has(t, /俯|top|high angle|overhead/) ? 2 : !op.custom ? poseOf(op.pose).camH : has(t, /pov|主观/) ? 1.4 : 1.1;
  // 相邻镜头换角度，避免直接切像跳帧（≥ 30°）
  const az = ([-35, 25, -65, 50, -10, 75, -45, 15][index % 8] * Math.PI) / 180;
  const move: SetMove = has(t, /推|push/) ? { kind: "push", amount: 0.5 } : has(t, /拉|pull/) ? { kind: "pull", amount: 0.5 } : has(t, /环绕|orbit/) ? { kind: "orbitR", amount: 0.5 } : has(t, /固定|三脚架|static|locked|tripod/) ? { kind: "static", amount: 0 } : { kind: "handheld", amount: 0.3 };
  return {
    lens,
    camPos: [Math.round(dist * Math.sin(az) * 100) / 100, Math.round(-dist * Math.cos(az) * 100) / 100, camH],
    lookAt: [0, 0, 0.35],
    bike: [0, 0],
    bikeYaw: 0,
    figure: has(t, /孩子|女儿|儿子|宝宝|child|kid|toddler|boy|girl/),
    aspect: 9 / 16,
    source: "按分镜自动摆的起始机位",
    move,
  };
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export function cleanLayout(l: unknown): SetLayout | null {
  if (!l || typeof l !== "object") return null;
  const x = l as Partial<SetLayout>;
  const v3 = (p: unknown) => (Array.isArray(p) && p.length === 3 && p.every((k) => num(k, -1e3, 1e3) !== null) ? (p as V3) : null);
  const lens = num(x.lens, 8, 400);
  const camPos = v3(x.camPos);
  const lookAt = v3(x.lookAt);
  if (lens === null || !camPos || !lookAt) return null;
  const bike = Array.isArray(x.bike) && x.bike.length === 2 && x.bike.every((k) => num(k, -1e3, 1e3) !== null) ? (x.bike as [number, number]) : undefined;
  const kind = MOVES.find((m) => m.id === x.move?.kind)?.id ?? "static";
  return { lens, camPos, lookAt, bike, bikeYaw: num(x.bikeYaw, -720, 720) ?? 0, bikeLift: num(x.bikeLift, 0, 3) ?? 0, bikeGround: num(x.bikeGround, 0, 3) ?? 0, bikePitch: num(x.bikePitch, -90, 90) ?? 0, bikeRoll: num(x.bikeRoll, -180, 180) ?? 0, figure: Boolean(x.figure), figures: cleanFigures(x.figures), aspect: 9 / 16, source: typeof x.source === "string" ? x.source.slice(0, 120) : "", move: { kind, amount: num(x.move?.amount, 0, 1) ?? 0 } };
}

/** 没有产品照时用的 3 张模型参考图（浏览器 3D 渲染）。角度沿用原 Blender 约定：azimuth 0° = 相机在模型 +z 方向 */
export const PRODUCT_REF_VIEWS = [
  { name: "ref-front34", azimuth_deg: -38, elevation_deg: 8 },
  { name: "ref-side", azimuth_deg: 0, elevation_deg: 4 },
  { name: "ref-back34", azimuth_deg: 140, elevation_deg: 12 },
] as const;
