// 3D 摆位的防呆规则（纯函数，客户端 3D 编辑器和测试共用）：谁骑车、谁拿车、车不立着时下车、新人偶放哪、场地物件叫什么、文字里 3D 摆不出来的动作。
import { isCarry, presetPose, rideOf, type FigureKind, type FigureSpec, type P3, type PoseTargets, type ProductRig } from "@/lib/figures";
import { findItemType, type SceneItem } from "@/lib/shorts-scenes";
import type { CastOption } from "@/lib/families";

export interface StagePose {
  figures: FigureSpec[];
  bike?: [number, number];
  bikeYaw: number;
  bikeLift: number;
  bikePitch: number;
  bikeRoll: number;
  bikeGround: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export const figName = (figs: FigureSpec[], f: FigureSpec, members: Pick<CastOption, "id" | "name">[] = []) =>
  `人偶${figs.findIndex((x) => x.id === f.id) + 1}·${members.find((m) => m.id === f.memberId)?.name ?? (f.kind === "adult" ? "大人" : "小孩")}`;

/** 骑在车上的人（只算有车的时候） */
export const ridersOf = (d: Pick<StagePose, "figures" | "bike">) => (d.bike ? d.figures.filter((f) => f.onProduct) : []);
/** 拿着车的人：第一个选了「提 / 抱」的 */
export const carrierOf = (d: Pick<StagePose, "figures" | "bike">) => (d.bike ? d.figures.find((f) => !f.onProduct && isCarry(f.pose)) : undefined);

/** 车是不是正常立在地上（能骑）：没侧倒、没竖起、没悬空 */
export const isUpright = (d: Pick<StagePose, "bikePitch" | "bikeRoll" | "bikeLift" | "bikeGround">) =>
  Math.abs(d.bikePitch) < 8 && Math.abs(d.bikeRoll) < 8 && d.bikeLift - d.bikeGround < 0.08;

/** 车悬空多少米（扣掉姿势本身需要的贴地高度） */
export const liftOf = (d: Pick<StagePose, "bikeLift" | "bikeGround">) => Math.max(0, r3(d.bikeLift - d.bikeGround));

/** 骑的按钮能不能点：不能点时给原因（写在按钮旁边） */
export function rideBlock(d: StagePose, f: FigureSpec, members: Pick<CastOption, "id" | "name">[] = []): string {
  if (!d.bike) return "场景里没有产品";
  const other = ridersOf(d).find((x) => x.id !== f.id);
  if (other) return `车上已经有${figName(d.figures, other, members)}了：这款车只有 1 个座位，不能两人同乘`;
  const c = carrierOf(d);
  if (c && c.id !== f.id) return `车在${figName(d.figures, c, members)}手上，先让他放下（换「站」）`;
  if (!isUpright(d)) return "车现在不是立着的：先在产品里点「立着」";
  return "";
}

/** 提 / 抱的按钮能不能点 */
export function carryBlock(d: StagePose, f: FigureSpec, members: Pick<CastOption, "id" | "name">[] = []): string {
  if (!d.bike) return "场景里没有产品";
  const c = carrierOf(d);
  if (c && c.id !== f.id) return `车已经在${figName(d.figures, c, members)}手上了`;
  const r = ridersOf(d).find((x) => x.id !== f.id);
  if (r) return `${figName(d.figures, r, members)}正骑在车上，先让他下车`;
  return "";
}

/** 人偶站位候选：相对产品朝向的 8 个方向 × 4 个距离 */
const SIDES = [-90, 90, -45, 45, -135, 135, 0, 180];
const RINGS = [0.75, 1, 1.3, 1.7, 2.2];

/** 点 p（地图坐标，离地 z 米）在哪个物件里面：机位穿进家具时提示 */
export function itemAt(p: [number, number], z: number, items: SceneItem[]): SceneItem | undefined {
  return items.find((i) => {
    if (i.h <= 0.06 || z < i.z || z > i.z + i.h || i.type === "floor" || i.type === "lawn" || i.type === "path") return false;
    const a = -rad(i.yaw);
    const x = p[0] - i.x;
    const y = p[1] - i.y;
    return Math.abs(x * Math.cos(a) - y * Math.sin(a)) < i.w / 2 && Math.abs(x * Math.sin(a) + y * Math.cos(a)) < i.d / 2;
  });
}

/**
 * 机位在墙外：从房间中心走到机位，中间穿过了墙（机位比墙顶低）。房间敞开的那一边不算墙外。
 * 返回挡住的墙和往回挪到墙内 0.3 米的位置。
 */
export function wallBetween(p: [number, number], z: number, items: SceneItem[]): { wall: SceneItem; inside: [number, number] } | null {
  const walls = items.filter((i) => (i.type === "wall" || isLegacyWall(i)) && z < i.z + i.h);
  const room = roomBox(items);
  if (!walls.length || !room) return null;
  const c: [number, number] = [(room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2];
  const len = Math.hypot(p[0] - c[0], p[1] - c[1]);
  const n = Math.ceil(len / 0.05);
  let hit: { wall: SceneItem; t: number } | null = null;
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    const q: [number, number] = [c[0] + (p[0] - c[0]) * t, c[1] + (p[1] - c[1]) * t];
    const w = walls.find((i) => {
      const a = -rad(i.yaw);
      const x = q[0] - i.x;
      const y = q[1] - i.y;
      return Math.abs(x * Math.cos(a) - y * Math.sin(a)) < i.w / 2 + 0.02 && Math.abs(x * Math.sin(a) + y * Math.cos(a)) < i.d / 2 + 0.02;
    });
    if (w && !hit) hit = { wall: w, t };
  }
  if (!hit) return null;
  const back = Math.max(0, hit.t - 0.3 / Math.max(len, 0.01));
  return { wall: hit.wall, inside: [r3(c[0] + (p[0] - c[0]) * back), r3(c[1] + (p[1] - c[1]) * back)] };
}

/** 不能站人的物件（有高度的家具；地板、地毯、草地这种平的不算） */
function blocked(p: [number, number], items: SceneItem[]) {
  return items.some((i) => {
    if (i.h <= 0.06 || i.z > 1.2) return false;
    const a = -rad(i.yaw);
    const x = p[0] - i.x;
    const y = p[1] - i.y;
    const lx = x * Math.cos(a) - y * Math.sin(a);
    const ly = x * Math.sin(a) + y * Math.cos(a);
    return Math.abs(lx) < i.w / 2 + 0.25 && Math.abs(ly) < i.d / 2 + 0.25;
  });
}

/** 新人偶 / 下车的人偶放哪：离车近、不穿家具、不挡在镜头和车中间、不和别人叠、在房间里；面向产品 */
export function freeSpot(d: StagePose, items: SceneItem[], cam?: [number, number], skipId?: string): { dx: number; dy: number; yaw: number } {
  const b = d.bike ?? [0, 0];
  const room = roomBox(items);
  const head = rad(d.bikeYaw);
  const fwd: [number, number] = [-Math.sin(head), Math.cos(head)];
  const camDir = cam ? norm([cam[0] - b[0], cam[1] - b[1]]) : null;
  const others = d.figures.filter((f) => f.id !== skipId && !f.onProduct).map((f) => [b[0] + f.dx, b[1] + f.dy]);
  const face = (dx: number, dy: number) => r3(wrap((Math.atan2(-dx, -dy) * 180) / Math.PI));
  let best: { dx: number; dy: number; score: number } | null = null;
  for (const [ri, r] of RINGS.entries())
    for (const s of SIDES) {
      const a = rad(s);
      const dir: [number, number] = [fwd[0] * Math.cos(a) - fwd[1] * Math.sin(a), fwd[0] * Math.sin(a) + fwd[1] * Math.cos(a)];
      const p: [number, number] = [b[0] + dir[0] * r, b[1] + dir[1] * r];
      if (blocked(p, items)) continue;
      if (room && !inBox(p, room, 0.2)) continue;
      if (others.some((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) < 0.5)) continue;
      const dot = camDir ? dir[0] * camDir[0] + dir[1] * camDir[1] : 0;
      // 侧面优先（不挡车也不背对镜头），稍微偏向镜头这边
      const score = ri * 2 + (dot > 0.6 ? 3 : Math.abs(dot) - 0.2 * dot);
      if (!best || score < best.score) best = { dx: r3(dir[0] * r), dy: r3(dir[1] * r), score };
    }
  const dx = best?.dx ?? 1;
  const dy = best?.dy ?? -0.4;
  return { dx, dy, yaw: face(dx, dy) };
}

const norm = (v: [number, number]): [number, number] => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/** 站在车的左 / 右 / 前 / 后（按车头方向，side = 从车头逆时针转的角度）多远，面向产品 */
export function relSpot(bikeYaw: number, side: number, dist: number): { dx: number; dy: number; yaw: number } {
  const a = rad(bikeYaw + side);
  const dx = r3(-Math.sin(a) * dist);
  const dy = r3(Math.cos(a) * dist);
  return { dx, dy, yaw: r3(wrap((Math.atan2(-dx, -dy) * 180) / Math.PI)) };
}

/** 产品在拿车人手里时，产品上的哪个点被握着（产品本地坐标：沿车身、离地） */
const holdPoint = (rig: ProductRig) => ({ along: rig.seatBack, up: rig.seatY });

/** 拿车人手的位置（人物本地坐标）：手脚拖过就用拖过的手 */
export function carryHand(f: FigureSpec, rig: ProductRig): P3 {
  const t = { ...presetPose(f.kind, f.pose, rideOf(rig), f.h), ...(f.custom ?? {}) } as Required<PoseTargets>;
  if (f.pose === "carry") return t.handR;
  return [(t.handL[0] + t.handR[0]) / 2, (t.handL[1] + t.handR[1]) / 2, (t.handL[2] + t.handR[2]) / 2 + 0.03];
}

/**
 * 把车挂到拿车人手上：单手提 = 车身顺着人朝向、挂在右手边；双手抱 = 车横在胸前。
 * 人的位置（地图）不动，车跟过去；返回新的摆位。
 */
export function attachCarried(d: StagePose, rig: ProductRig): StagePose {
  const c = carrierOf(d);
  if (!c || !d.bike) return d;
  const P: [number, number] = [d.bike[0] + c.dx, d.bike[1] + c.dy];
  const th = Math.PI - rad(c.yaw);
  const [hx, hy, hz] = carryHand(c, rig);
  // 人物本地 → three（绕 y 转 th）→ 地图（y = -z）
  const ox = hx * Math.cos(th) + hz * Math.sin(th);
  const oz = -hx * Math.sin(th) + hz * Math.cos(th);
  const hand: [number, number] = [P[0] + ox, P[1] - oz];
  const bikeYaw = r3(wrap(c.pose === "carry" ? -c.yaw : -c.yaw + 90));
  const phi = rad(bikeYaw - 90);
  const { along, up } = holdPoint(rig);
  const seat: [number, number] = [along * Math.cos(phi), along * Math.sin(phi)];
  const bike: [number, number] = [r3(hand[0] - seat[0]), r3(hand[1] - seat[1])];
  const bikeLift = r3(Math.max(0.02, hy - up));
  const shift = (f: FigureSpec) => ({ ...f, dx: r3(d.bike![0] + f.dx - bike[0]), dy: r3(d.bike![1] + f.dy - bike[1]) });
  return { ...d, bike, bikeYaw, bikeLift, bikePitch: 0, bikeRoll: 0, bikeGround: 0, figures: d.figures.map(shift) };
}

/**
 * 每次改完摆位都过一遍：有人拿车 → 车挂到手上；车不是立着的 → 骑车的人自动下车（站到车旁）；
 * 多人骑 → 只留第一个。返回新的摆位和要告诉用户的话（显示在刚点的按钮旁边）。
 */
export function normalizeStage<T extends StagePose>(d: T, rig: ProductRig, items: SceneItem[] = [], cam?: [number, number], members: Pick<CastOption, "id" | "name">[] = []): { doc: T; notes: string[] } {
  const notes: string[] = [];
  let out: T = d;
  const carriers = d.bike ? d.figures.filter((f) => !f.onProduct && isCarry(f.pose)) : [];
  if (carriers.length > 1) {
    const keep = carriers[0].id;
    out = { ...out, figures: out.figures.map((f) => (f.id !== keep && !f.onProduct && isCarry(f.pose) ? { ...f, pose: "stand", custom: undefined } : f)) };
    notes.push(`车只能一个人拿：${carriers.slice(1).map((f) => figName(d.figures, f, members)).join("、")}改成「站」`);
  }
  out = { ...out, ...attachCarried(out, rig) };
  const riders = ridersOf(out);
  const extra = riders.slice(isUpright(out) && !carrierOf(out) ? 1 : 0);
  if (extra.length) {
    const why = carrierOf(out) ? "车被人拿起来了" : !isUpright(out) ? "车不是立着的" : "车只有 1 个座位";
    let figs = out.figures;
    for (const f of extra) {
      const spot = freeSpot({ ...out, figures: figs }, items, cam, f.id);
      figs = figs.map((x) => (x.id === f.id ? { ...x, onProduct: false, pose: "stand", custom: undefined, ...spot } : x));
    }
    out = { ...out, figures: figs };
    notes.push(`${why}：${extra.map((f) => figName(d.figures, f, members)).join("、")}已下车，站到车旁边`);
  }
  return { doc: out, notes };
}

/* ---------- 场地物件 ---------- */

const isLegacyFloor = (i: SceneItem) => i.type === "box" && i.h <= 0.05 && i.w * i.d >= 4;
const isLegacyWall = (i: SceneItem) => i.type === "box" && Math.min(i.w, i.d) <= 0.2 && i.h >= 1.8;
const STRUCT_TYPES = new Set(["floor", "wall", "lawn", "path", "house"]);
/** 墙 / 地板这类「场地本身」：默认锁住，打开「编辑场地」才能点 */
export const isStructure = (i: SceneItem) => STRUCT_TYPES.has(i.type) || isLegacyFloor(i) || isLegacyWall(i);

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const extent = (i: SceneItem) => {
  const a = rad(i.yaw);
  const hw = (Math.abs(Math.cos(a)) * i.w + Math.abs(Math.sin(a)) * i.d) / 2;
  const hd = (Math.abs(Math.sin(a)) * i.w + Math.abs(Math.cos(a)) * i.d) / 2;
  return { x0: i.x - hw, x1: i.x + hw, y0: i.y - hd, y1: i.y + hd };
};
const union = (bs: Box[]): Box | null =>
  bs.length ? { x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)), y0: Math.min(...bs.map((b) => b.y0)), y1: Math.max(...bs.map((b) => b.y1)) } : null;

/** 房间范围：地板（没地板就用墙）围出来的框；户外没有 */
export function roomBox(items: SceneItem[]): Box | null {
  const floors = items.filter((i) => i.type === "floor" || isLegacyFloor(i));
  if (floors.length) return union(floors.map(extent));
  const walls = items.filter((i) => i.type === "wall" || isLegacyWall(i));
  return walls.length >= 2 ? union(walls.map(extent)) : null;
}
export const inBox = (p: [number, number], b: Box, m = 0) => p[0] >= b.x0 + m && p[0] <= b.x1 - m && p[1] >= b.y0 + m && p[1] <= b.y1 - m;
/** 所有物件的范围（地图自动缩放用） */
export const itemsBox = (items: SceneItem[]) => union(items.map(extent));

/** 物件显示名：旧版「灰盒」按尺寸和位置猜成地板 / 前后左右墙，猜不出来的写尺寸 */
export function itemLabel(i: SceneItem, items: SceneItem[]): string {
  if (i.type !== "box") return findItemType(i.type).label;
  if (isLegacyFloor(i)) return "地板";
  const room = roomBox(items);
  const cx = room ? (room.x0 + room.x1) / 2 : 0;
  const cy = room ? (room.y0 + room.y1) / 2 : 0;
  if (isLegacyWall(i)) {
    const e = extent(i);
    const alongX = e.x1 - e.x0 >= e.y1 - e.y0;
    return alongX ? (i.y > cy ? "后墙（地图上方）" : "前墙（地图下方）") : i.x < cx ? "左墙" : "右墙";
  }
  const n = items.filter((x) => x.type === "box" && !isLegacyFloor(x) && !isLegacyWall(x)).findIndex((x) => x.id === i.id) + 1;
  return `物件${n} · ${i.w.toFixed(1)}×${i.d.toFixed(1)} 米`;
}

/* ---------- 文字里 3D 摆不出来的东西 ---------- */

export interface StageNote {
  key: string;
  text: string;
}

const MOTION = /(走过|走向|走到|走来|走着|跑|冲|追|骑过来|骑向|骑着.{0,8}(过来|前进|离开|往)|推着.{0,10}走|滑行|转圈|\bwalk|\brun|\brush|\bchase|\bride[sd]? (toward|towards|up|away|past|across)|\bpush(es|ing)? .{0,20}(along|forward))/i;
const LIMITS: [string, RegExp, string][] = [
  ["fold", /(折叠|收起来|收车|\bfold)/i, "折叠：3D 里没有折叠状态的车，只能摆展开的；建议拆成「折叠前」「折叠后」两个镜头"],
  ["trunk", /(后备箱|\btrunk)/i, "放进后备箱：场地里的汽车只是方块，后备箱打不开；只摆「拿着车站在车旁」这一帧"],
  ["push", /(推着|推杆|推把|\bpush)/i, "大人推车：没有「推着走」的姿势，手也绑不到推杆；摆成大人站在车后、选「扶着」，走的动作交给 AI"],
  ["wheel", /(轮子转|车轮转|\bwheels? (spin|turn))/i, "轮子转动：3D 里轮子不会转，靠 AI 视频"],
  ["fall", /(摔|跌倒|翻车|\bfall)/i, "摔倒 / 翻车：没有这种预设，AI 也容易画坏，建议删掉或拆镜"],
  ["standon", /(站在车上|站在座位上|\bstand(ing)? on the (seat|bike|product))/i, "站在车上：没有这种预设，也不安全，建议改掉"],
  ["touch", /(牵手|击掌|递给|\bhigh[- ]five|\bhand(s|ing)? (it )?over)/i, "牵手 / 击掌 / 递东西：3D 只能把手摆近，碰到的那一下靠 AI"],
];
const CARRY_WORDS = /(提起|拎起|拎着|抱起|抱着车|举起|\blift|\bcarr(y|ies|ying))/i;

/** 按文字给 3D 页的说明：连续动作只管第一帧；摆不出来的动作直接说；文字要提车但没人拿 */
export function stageTextNotes(text: string, d?: Pick<StagePose, "figures" | "bike">): StageNote[] {
  const out: StageNote[] = [];
  const m = text.match(MOTION);
  if (m) out.push({ key: "motion", text: `文字里有「${m[0].trim()}」：3D 只管第一帧，动作靠 AI 视频；复杂动作建议拆成 2 个镜头` });
  for (const [key, re, t] of LIMITS) if (re.test(text)) out.push({ key, text: t });
  if (d && CARRY_WORDS.test(text) && !carrierOf(d)) out.push({ key: "carry", text: "文字写了提 / 抱车：给拿车的人选「单手提起产品」或「双手抱起产品」，车会自动挂到手上" });
  return out;
}

/** 3D 本身的问题（不看文字）：车悬空没人拿、骑车的人和车姿势冲突、拍摄者也在画面里 */
export function stageRuleIssues(d: StagePose, members: Pick<CastOption, "id" | "name">[] = [], filmerId?: string): string[] {
  const out: string[] = [];
  const lift = liftOf(d);
  if (d.bike && lift >= 0.08 && !carrierOf(d)) out.push(`车悬空 ${lift.toFixed(2)} 米，没有人拿着：要人提着就给人偶选「单手提起产品」；故意要悬浮效果可以不管`);
  const riders = ridersOf(d);
  if (riders.length > 1) out.push(`${riders.map((f) => figName(d.figures, f, members)).join("、")}都骑在车上：这款车只有 1 个座位`);
  if (riders.length && !isUpright(d)) out.push(`车不是立着的，${figName(d.figures, riders[0], members)}还骑在上面：点一下人偶会自动下车`);
  if (filmerId) {
    const f = d.figures.find((x) => x.memberId === filmerId);
    if (f) out.push(`${figName(d.figures, f, members)}是拿手机拍的人，不能同时出现在画面里：换一个人`);
  }
  return out;
}

/* ---------- 文字里的人 vs 家庭 / 3D ---------- */

const WHO: { re: RegExp; roles: string[]; label: string; kind: FigureKind }[] = [
  { re: /(女孩|女儿|妹妹|姐姐|小女生|\bgirl|\bdaughter|\bsister)/i, roles: ["daughter"], label: "女孩", kind: "child" },
  { re: /(男孩|儿子|弟弟|哥哥|小男生|\bboy\b|\bson\b|\bbrother)/i, roles: ["son"], label: "男孩", kind: "child" },
  { re: /(妈妈|母亲|\bmom\b|\bmother|\bmum\b)/i, roles: ["mom"], label: "妈妈", kind: "adult" },
  { re: /(爸爸|父亲|\bdad\b|\bfather)/i, roles: ["dad"], label: "爸爸", kind: "adult" },
  { re: /(奶奶|外婆|\bgrandma|\bgrandmother)/i, roles: ["grandma"], label: "奶奶 / 外婆", kind: "adult" },
  { re: /(爷爷|外公|\bgrandpa|\bgrandfather)/i, roles: ["grandpa"], label: "爷爷 / 外公", kind: "adult" },
];

/** 文字里写的人，这一镜能出镜的家庭成员里有没有（拿手机的人已经去掉了）；3D 里有没有对应大人 / 小孩人偶 */
export function castTextIssues(text: string, members: Pick<CastOption, "id" | "name" | "role" | "kind">[], figs: FigureSpec[]): string[] {
  const out: string[] = [];
  const known = members.some((m) => m.role);
  for (const w of WHO) {
    if (!w.re.test(text)) continue;
    if (known && !members.some((m) => m.role && w.roles.includes(m.role)))
      out.push(`文字写了「${w.label}」，这一镜能出镜的家人里没有${w.label}（拿手机的人不算）：换家庭，或把文字改成家里有的人${members.length ? `（如 ${members.map((m) => m.name).join("、")}）` : ""}`);
    else if (!figs.some((f) => f.kind === w.kind)) out.push(`文字写了「${w.label}」，3D 里没有${w.kind === "adult" ? "大人" : "小孩"}人偶：点「+ ${w.kind === "adult" ? "大人" : "小孩"}」加一个`);
  }
  return out;
}
