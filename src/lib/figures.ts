// 3D 构图里的人偶（每镜保存）和产品接触点（每个产品模型保存）。纯数据，网页预览和以后的 Blender 渲染共用。

export type FigureKind = "adult" | "child";
export type FigurePose = "stand" | "crouch" | "ride" | "sit" | "hold" | "reach" | "point" | "carry" | "hug";
export type P3 = [number, number, number];

export const FIGURE_POSES: { id: FigurePose; label: string }[] = [
  { id: "stand", label: "站" },
  { id: "crouch", label: "蹲" },
  { id: "ride", label: "骑 / 坐在产品上" },
  { id: "sit", label: "坐在地上" },
  { id: "hold", label: "扶着（双手向前）" },
  { id: "reach", label: "伸出一只手" },
  { id: "point", label: "指向（一只手指着）" },
  { id: "carry", label: "单手提起产品" },
  { id: "hug", label: "双手抱起产品" },
];
/** 拿着产品的姿势：选了它，产品自动挂到这个人手上 */
export const CARRY_POSES: FigurePose[] = ["carry", "hug"];
export const isCarry = (p: FigurePose) => CARRY_POSES.includes(p);

/** 姿态目标（人偶本地坐标，+z 朝前，+x 是人偶的左边，米）；自定义时只填要改的，其余用预设 */
export interface PoseTargets {
  hip?: P3;
  /** 身体前倾（弧度） */
  lean?: number;
  /** 头左右转（弧度，正 = 向左） */
  head?: number;
  handL?: P3;
  handR?: P3;
  footL?: P3;
  footR?: P3;
}
export const JOINTS = [
  { id: "hip", label: "臀部" },
  { id: "handL", label: "左手" },
  { id: "handR", label: "右手" },
  { id: "footL", label: "左脚" },
  { id: "footR", label: "右脚" },
] as const;
export type JointId = (typeof JOINTS)[number]["id"];

export interface FigureSpec {
  id: string;
  kind: FigureKind;
  pose: FigurePose;
  /** 骑 / 坐在产品上：位置和朝向跟着产品，手脚吸到产品接触点 */
  onProduct: boolean;
  /** 不在产品上时：相对产品位置的偏移（地图坐标，x 东、y 北，米）；没有产品时相对原点 */
  dx: number;
  dy: number;
  /** 面朝方向：北 = 0°，东 = 90° */
  yaw: number;
  custom?: PoseTargets;
  /** 用户写的这个人在做什么（中文原话）；提示词里的动作只来自这里 */
  action?: string;
  /** action 的英文，保存时自动翻译 */
  actionEn?: string;
  /** 家庭库成员（families.ts）；绑定后按成员身高缩放 */
  memberId?: string;
  /** 身高（米）；空 = 大人 1.75 / 小孩 0.95 */
  h?: number;
}

/** 骑乘接触点（人偶本地坐标：原点在座椅中心正下方的地面，+z 朝车头） */
export interface RideRig {
  seatY: number;
  gripX: number;
  gripY: number;
  gripZ: number;
  footX: number;
  footZ: number;
  /** 脚踏面离地高度（没有 = 踩地） */
  footY?: number;
}

/** 产品接触点（产品本地：以模型中心为准，fwd = 往产品前方多少米，负数 = 往后） */
export interface ProductRig {
  seatBack: number;
  seatY: number;
  gripX: number;
  gripY: number;
  gripFwd: number;
  footX: number;
  footFwd: number;
  /** 脚踏面离地高度（三轮车等；没有 = 踩地） */
  footY?: number;
}

/** KB002 实测 */
export const KB002_RIG: ProductRig = { seatBack: 0.09, seatY: 0.39, gripX: 0.17, gripY: 0.51, gripFwd: 0.14, footX: 0.11, footFwd: -0.03 };

/** 产品类型：决定自动量接触点的规则（平衡车脚踩地、三轮车脚踩脚踏） */
export type RideKind = "balance" | "tricycle" | "other";
export const RIDE_KINDS: { k: RideKind; label: string }[] = [
  { k: "balance", label: "平衡车（脚踩地）" },
  { k: "tricycle", label: "三轮车（脚踩脚踏）" },
  { k: "other", label: "其他（不自动量，按平衡车比例估）" },
];
/** 没选类型时按品类文字猜 */
export function rideKindOf(kind: string | undefined, category = ""): RideKind {
  if (kind === "balance" || kind === "tricycle" || kind === "other") return kind;
  return /三轮/.test(category) ? "tricycle" : /平衡/.test(category) ? "balance" : "other";
}

/** 按模型外形尺寸（长 L 沿车头方向、宽 W、高 H）估一版；平衡车比例来自 KB002 实测，三轮车来自 TC003 实测 */
export function estimateRig(L: number, W: number, H: number, kind: RideKind = "balance"): ProductRig {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  if (kind === "tricycle")
    return { seatBack: r(0.015 * L), seatY: r(0.566 * H), gripX: r(0.403 * W), gripY: r(0.974 * H), gripFwd: r(0.307 * L), footX: r(0.349 * W), footFwd: r(0.316 * L), footY: r(0.246 * H) };
  return { seatBack: r(0.11 * L), seatY: r(0.74 * H), gripX: r(0.39 * W), gripY: r(0.96 * H), gripFwd: r(0.17 * L), footX: r(Math.max(0.11, 0.25 * W)), footFwd: r(-0.04 * L) };
}

export type RigKey = "seat" | "gripL" | "gripR" | "footL" | "footR";
export const RIG_KEYS: { k: RigKey; label: string; color: string }[] = [
  { k: "seat", label: "座位", color: "#f59e0b" },
  { k: "gripL", label: "左握把", color: "#22d3ee" },
  { k: "gripR", label: "右握把", color: "#22d3ee" },
  { k: "footL", label: "左脚", color: "#a3e635" },
  { k: "footR", label: "右脚", color: "#a3e635" },
];
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** 产品本地坐标（车头朝 -x，地面 y = 0，模型中心 x = z = 0）里的接触点 */
export function rigLocal(g: ProductRig, k: RigKey): P3 {
  if (k === "seat") return [g.seatBack, g.seatY, 0];
  if (k === "gripL" || k === "gripR") return [-g.gripFwd, g.gripY, k === "gripL" ? g.gripX : -g.gripX];
  return [-g.footFwd, g.footY ?? 0.03, k === "footL" ? g.footX : -g.footX];
}
/** 拖动一个点后更新接触点（左右对称）；脚抬离地面 6cm 以上记成脚踏高度 */
export function rigFrom(g: ProductRig, k: RigKey, p: { x: number; y: number; z: number }): ProductRig {
  if (k === "seat") return { ...g, seatBack: r3(p.x), seatY: r3(Math.max(0, p.y)) };
  if (k === "gripL" || k === "gripR") return { ...g, gripFwd: r3(-p.x), gripY: r3(Math.max(0, p.y)), gripX: r3(Math.abs(p.z)) };
  return { ...g, footFwd: r3(-p.x), footX: r3(Math.abs(p.z)), footY: p.y > 0.06 ? r3(p.y) : undefined };
}
/** 整组接触点乘同一个比例（模型单位 → 米） */
export function scaleRig(g: ProductRig, k: number): ProductRig {
  const out = {} as ProductRig;
  for (const [key, v] of Object.entries(g) as [keyof ProductRig, number | undefined][]) if (typeof v === "number") out[key] = r3(v * k);
  return out;
}

export const rideOf = (g: ProductRig): RideRig => ({ seatY: g.seatY, gripX: g.gripX, gripY: g.gripY, gripZ: g.gripFwd + g.seatBack, footX: g.footX, footZ: g.footFwd + g.seatBack, footY: g.footY });

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const p3 = (v: unknown): P3 | undefined => (Array.isArray(v) && v.length === 3 && v.every((k) => typeof k === "number" && Number.isFinite(k) && Math.abs(k) < 5) ? (v as P3) : undefined);

export function cleanRig(v: unknown): ProductRig | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  const out = {} as ProductRig;
  for (const k of Object.keys(KB002_RIG) as (keyof ProductRig)[]) {
    if (typeof x[k] !== "number" || !Number.isFinite(x[k])) return null;
    out[k] = num(x[k], -5, 5, 0);
  }
  if (typeof x.footY === "number" && Number.isFinite(x.footY)) out.footY = num(x.footY, 0, 2, 0);
  return out;
}

export function cleanFigures(v: unknown): FigureSpec[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 6).flatMap((f, i): FigureSpec[] => {
    if (!f || typeof f !== "object") return [];
    const x = f as Record<string, unknown>;
    const c = (x.custom ?? {}) as Record<string, unknown>;
    const custom: PoseTargets = {};
    for (const j of JOINTS) {
      const p = p3(c[j.id]);
      if (p) custom[j.id] = p;
    }
    if (typeof c.lean === "number") custom.lean = num(c.lean, -1.2, 1.2, 0);
    if (typeof c.head === "number") custom.head = num(c.head, -1.6, 1.6, 0);
    return [
      {
        id: typeof x.id === "string" ? x.id.slice(0, 40) : `f${i + 1}`,
        kind: x.kind === "adult" ? "adult" : "child",
        pose: FIGURE_POSES.find((p) => p.id === x.pose)?.id ?? "stand",
        onProduct: Boolean(x.onProduct),
        dx: num(x.dx, -50, 50, 0),
        dy: num(x.dy, -50, 50, 0),
        yaw: num(x.yaw, -360, 360, 0),
        ...(Object.keys(custom).length ? { custom } : {}),
        ...(typeof x.action === "string" && x.action.trim()
          ? { action: x.action.trim().slice(0, 200), ...(typeof x.actionEn === "string" && x.actionEn.trim() ? { actionEn: x.actionEn.trim().slice(0, 400) } : {}) }
          : {}),
        ...(typeof x.memberId === "string" && x.memberId ? { memberId: x.memberId.slice(0, 40) } : {}),
        ...(typeof x.h === "number" && Number.isFinite(x.h) ? { h: num(x.h, 0.6, 2.1, 1) } : {}),
      },
    ];
  });
}

/** 旧数据只有 figure: true（一个骑车的小孩） */
export function figuresOf(l: { figures?: FigureSpec[]; figure?: boolean }): FigureSpec[] {
  if (l.figures) return l.figures;
  return l.figure ? [{ id: "f1", kind: "child", pose: "ride", onProduct: true, dx: 0, dy: 0, yaw: 0 }] : [];
}

/** 人偶尺寸（大人 1.75 m / 3 岁小孩 0.95 m） */
export function figureDims(kind: FigureKind, h?: number) {
  const H = h && h > 0.5 ? h : kind === "adult" ? 1.75 : 0.95;
  return {
    H,
    thigh: 0.235 * H,
    shin: 0.225 * H,
    ankle: 0.045 * H,
    torso: 0.31 * H,
    neck: 0.035 * H,
    headR: (kind === "adult" ? 0.062 : 0.078) * H,
    ua: 0.17 * H,
    fa: 0.155 * H,
    sh: (kind === "adult" ? 0.12 : 0.11) * H,
    hipW: 0.06 * H,
    foot: 0.15 * H,
  };
}

/** 预设姿态 → 完整目标 */
export function presetPose(kind: FigureKind, pose: FigurePose, ride: RideRig = rideOf(KB002_RIG), h?: number): Required<PoseTargets> {
  const d = figureDims(kind, h);
  const H = d.H;
  const shoulderY = (hipY: number, lean: number) => hipY + d.torso * Math.cos(lean) - 0.03 * H;
  if (pose === "ride") {
    const hipY = ride.seatY + 0.035 * H;
    return { hip: [0, hipY, -0.01], lean: 0.25, head: 0, handL: [ride.gripX, ride.gripY, ride.gripZ], handR: [-ride.gripX, ride.gripY, ride.gripZ], footL: [ride.footX, (ride.footY ?? 0) + d.ankle, ride.footZ], footR: [-ride.footX, (ride.footY ?? 0) + d.ankle, ride.footZ] };
  }
  if (pose === "crouch") {
    const hipY = 0.27 * H;
    return { hip: [0, hipY, -0.1 * H], lean: 0.55, head: 0, handL: [0.09 * H, 0.3 * H, 0.22 * H], handR: [-0.09 * H, 0.3 * H, 0.22 * H], footL: [d.hipW * 1.4, d.ankle, 0.08 * H], footR: [-d.hipW * 1.4, d.ankle, 0.08 * H] };
  }
  if (pose === "sit")
    return { hip: [0, 0.06 * H, 0], lean: 0.12, head: 0, handL: [0.12 * H, 0.16 * H, 0.2 * H], handR: [-0.12 * H, 0.16 * H, 0.2 * H], footL: [0.1 * H, d.ankle, 0.4 * H], footR: [-0.1 * H, d.ankle, 0.4 * H] };
  const hipY = d.thigh + d.shin + d.ankle - 0.005 * H;
  const hy = shoulderY(hipY, 0.02) - (d.ua + d.fa) * 0.97;
  const feet = { footL: [d.hipW * 1.1, d.ankle, 0.02 * H] as P3, footR: [-d.hipW * 1.1, d.ankle, 0.02 * H] as P3 };
  // 提 / 抱：产品宽度按握把间距估（两种车握把都在约 0.4 × 车宽）
  const prodW = Math.max(0.25, (ride.gripX * 2) / 0.8);
  if (pose === "carry") {
    const arm = (d.ua + d.fa) * 0.97;
    const out = Math.min(0.45 * arm, prodW * 0.5);
    const y = shoulderY(hipY, 0.02) - Math.sqrt(Math.max(0.01, arm * arm - out * out));
    return { hip: [0, hipY, 0], lean: 0.02, head: 0, handL: [d.sh + 0.025 * H, hy, 0.03 * H], handR: [-(d.sh + out), y, 0.03 * H], ...feet };
  }
  if (pose === "hug") {
    const y = hipY + 0.14 * H;
    return { hip: [0, hipY, 0], lean: -0.04, head: 0, handL: [0.13 * H, y, 0.2 * H], handR: [-0.13 * H, y, 0.2 * H], ...feet };
  }
  if (pose === "hold") {
    const hands = hipY + 0.06 * H;
    return { hip: [0, hipY, 0], lean: 0.12, head: 0, handL: [0.12 * H, hands, 0.26 * H], handR: [-0.12 * H, hands, 0.26 * H], footL: [d.hipW * 1.1, d.ankle, 0.02 * H], footR: [-d.hipW * 1.1, d.ankle, 0.02 * H] };
  }
  if (pose === "point")
    return { hip: [0, hipY, 0], lean: 0.04, head: 0, handL: [d.sh + 0.025 * H, hy, 0.03 * H], handR: [-0.06 * H, shoulderY(hipY, 0.04) - 0.1 * H, 0.36 * H], footL: [d.hipW * 1.1, d.ankle, 0.02 * H], footR: [-d.hipW * 1.1, d.ankle, 0.02 * H] };
  if (pose === "reach")
    return { hip: [0, hipY, 0], lean: 0.08, head: 0, handL: [d.sh + 0.025 * H, hy, 0.03 * H], handR: [-0.1 * H, shoulderY(hipY, 0.08) - 0.02 * H, 0.31 * H], footL: [d.hipW * 1.1, d.ankle, 0.02 * H], footR: [-d.hipW * 1.1, d.ankle, 0.02 * H] };
  return { hip: [0, hipY, 0], lean: 0.02, head: 0, handL: [d.sh + 0.025 * H, hy, 0.03 * H], handR: [-(d.sh + 0.025 * H), hy, 0.03 * H], footL: [d.hipW * 1.1, d.ankle, 0.02 * H], footR: [-d.hipW * 1.1, d.ankle, 0.02 * H] };
}
