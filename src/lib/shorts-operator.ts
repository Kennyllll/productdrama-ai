// 拍摄者（拿手机的人）：先定姿态，再按 3D 机位算出画面里露出身体的哪些部分。网页 3D、提示词、文字检查共用。
import type { SetLayout } from "@/lib/production-repo";

export type OpPose = "stand" | "crouch" | "sit";

/** camH = 选姿态时给的默认机位高度；lo–hi = 这个姿态拿手机的合理高度；back = 手机在身体前方多远 */
export const OP_POSES: { id: OpPose; label: string; en: string; camH: number; lo: number; hi: number; back: number }[] = [
  { id: "stand", label: "站着", en: "standing upright", camH: 1.5, lo: 1.2, hi: 1.85, back: 0.3 },
  { id: "crouch", label: "蹲着", en: "crouching down", camH: 0.75, lo: 0.5, hi: 1.0, back: 0.3 },
  { id: "sit", label: "坐在地上", en: "sitting on the ground with legs stretched out in front", camH: 0.6, lo: 0.4, hi: 0.85, back: 0.35 },
];

export type HandAct = "point" | "wave" | "reach";
export const HAND_ACTS: { id: HandAct; label: string; en: string }[] = [
  { id: "point", label: "指向孩子", en: "pointing toward the kid" },
  { id: "wave", label: "挥手", en: "waving" },
  { id: "reach", label: "伸手去扶", en: "reaching out toward the kid" },
];
export const actOf = (a: HandAct | null) => HAND_ACTS.find((x) => x.id === a) ?? null;

export interface OpSpec {
  pose: OpPose;
  /** 空着的那只手入镜 */
  hand: boolean;
  /** 空着的手做什么；勾了手就必须选（null = 还没选） */
  act: HandAct | null;
  /** 哪只手拿手机：R = 右手拿（空着的是左手，从画面左下角进） */
  phone: "R" | "L";
  shadow: boolean;
  /** 自己写的描述（旧数据或特殊情况），有值时不自动算 */
  custom?: string;
}

/** 存储格式："stand" / "crouch+hand" / "sit+hand+shadow"；旧值 ""、feet、hand、shadow 都按站着处理 */
export function parseOp(op: string | undefined): OpSpec {
  const v = (op ?? "").trim();
  const base: OpSpec = { pose: "stand", hand: false, act: null, phone: "R", shadow: false };
  if (!v || v === "feet") return base;
  if (v === "hand") return { ...base, hand: true };
  if (v === "shadow") return { ...base, shadow: true };
  const [p, ...rest] = v.split("+");
  const ok = (x: string) => x === "hand" || x === "shadow" || x === "phoneL" || /^hand=(point|wave|reach)$/.test(x);
  if (!OP_POSES.some((x) => x.id === p) || !rest.every(ok)) return { ...base, custom: v };
  const h = rest.find((x) => x.startsWith("hand"));
  return { pose: p as OpPose, hand: Boolean(h), act: (h?.split("=")[1] as HandAct | undefined) ?? null, phone: rest.includes("phoneL") ? "L" : "R", shadow: rest.includes("shadow") };
}

export const opString = (o: OpSpec) =>
  o.custom ?? [o.pose, o.hand ? (o.act ? `hand=${o.act}` : "hand") : "", o.shadow ? "shadow" : "", o.hand && o.phone === "L" ? "phoneL" : ""].filter(Boolean).join("+");
/** 空着的手：右手拿手机 → 左手从画面左下角进 */
export const freeHand = (o: OpSpec) => (o.phone === "R" ? { side: "left" as const, zh: "左手", other: "right" } : { side: "right" as const, zh: "右手", other: "left" });
/** 会画进 3D 构图的部分（姿态、空着的手）；变了构图要重新保存 */
/** 勾了空着的手但没选动作 */
export const opMissing = (op: string | undefined) => {
  const o = parseOp(op);
  return !o.custom && o.hand && !o.act ? "空着的手入镜：还没选动作（必填）" : "";
};
export const opCompKey = (o: OpSpec) => [o.custom ? "custom" : o.pose, o.hand ? `${o.phone}${o.act}` : ""].join("|");
export const poseOf = (p: OpPose) => OP_POSES.find((x) => x.id === p) ?? OP_POSES[0];

export function describeOp(op: string | undefined): string {
  const o = parseOp(op);
  if (o.custom) return `自己写：${o.custom.slice(0, 20)}`;
  return [poseOf(o.pose).label, o.hand ? `${freeHand(o).zh}入镜·${actOf(o.act)?.label ?? "未选动作"}` : "", o.shadow ? "影子" : ""].filter(Boolean).join(" + ");
}

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mid = (a: V3, b: V3): V3 => mul(add(a, b), 0.5);

// 和 scene-mesh 的大人人偶（1.75 m）同一套尺寸和预设姿态；本地坐标 x 左、y 上、z 前
const H = 1.75;
const THIGH = 0.235 * H;
const SHIN = 0.225 * H;
const ANKLE = 0.045 * H;
const HIP_W = 0.06 * H;
const TOE = 0.18;
const LEGS: Record<OpPose, { hip: V3; foot: V3 }> = {
  stand: { hip: [0, 0.875, 0], foot: [0.1155, ANKLE, 0.035] },
  crouch: { hip: [0, 0.4725, -0.175], foot: [0.147, ANKLE, 0.14] },
  sit: { hip: [0, 0.105, 0], foot: [0.175, ANKLE, 0.7] },
};
/** 3D 人偶的手放到身体两侧偏后，免得在画面里多出两只手（拿手机的那只在镜头后面） */
export const OP_HANDS: Record<OpPose, { handL: V3; handR: V3 } | null> = {
  stand: null,
  crouch: { handL: [0.25, 0.6, -0.1], handR: [-0.25, 0.6, -0.1] },
  sit: { handL: [0.25, 0.25, -0.15], handR: [-0.25, 0.25, -0.15] },
};

function kneeOf(hip: V3, ank: V3): V3 {
  const ac = sub(ank, hip);
  const len = Math.hypot(...ac) || 1e-4;
  const dist = Math.max(1e-4, Math.min(len, THIGH + SHIN - 1e-4));
  const dir = mul(ac, 1 / len);
  const x = (THIGH * THIGH - SHIN * SHIN + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, THIGH * THIGH - x * x));
  const hint: V3 = [0, 0.4, 1];
  const perp = norm(sub(hint, mul(dir, dot(hint, dir))));
  return add(add(hip, mul(dir, x)), mul(perp, h));
}

/** 拍摄者身体原点（两脚之间的地面，地图坐标）和面朝方向：手机在身体前方 back 米 */
export function operatorOrigin(pose: OpPose, l: SetLayout): { x: number; y: number; heading: number } {
  const fx = l.lookAt[0] - l.camPos[0];
  const fy = l.lookAt[1] - l.camPos[1];
  const n = Math.hypot(fx, fy);
  const F = n > 1e-6 ? [fx / n, fy / n] : [0, 1];
  const back = poseOf(pose).back;
  return { x: l.camPos[0] - back * F[0], y: l.camPos[1] - back * F[1], heading: (Math.atan2(F[0], F[1]) * 180) / Math.PI };
}

export type OpPart = "toe" | "shin" | "knee" | "thigh";
export const PART_LABEL: Record<OpPart, string> = { toe: "鞋尖", shin: "小腿", knee: "膝盖", thigh: "大腿" };
const PART_EN: Record<OpPart, string> = { toe: "the toe ends of their cozy slippers", shin: "their shins", knee: "their knees", thigh: "their thighs and lap" };

/** 按姿态 + 机位算拍摄者露出哪些部位、在画面哪里 */
export function operatorView(pose: OpPose, l: SetLayout): { parts: OpPart[]; zh: string; en: string } {
  const o = operatorOrigin(pose, l);
  const hd = (o.heading * Math.PI) / 180;
  const F = [Math.sin(hd), Math.cos(hd)];
  const L = [-F[1], F[0]];
  const world = (p: V3): V3 => [o.x + p[2] * F[0] + p[0] * L[0], o.y + p[2] * F[1] + p[0] * L[1], p[1]];
  const C = l.camPos as V3;
  const f = norm(sub(l.lookAt as V3, C));
  let r = cross(f, [0, 0, 1]);
  if (Math.hypot(...r) < 1e-6) r = [1, 0, 0];
  r = norm(r);
  const u = cross(r, f);
  const tanH = 18 / l.lens;
  const tanV = tanH / (l.aspect || 9 / 16);
  const proj = (p: V3): [number, number] | null => {
    const d = sub(world(p), C);
    const z = dot(d, f);
    if (z < 0.05) return null;
    const nx = dot(d, r) / z / tanH;
    const ny = dot(d, u) / z / tanV;
    return Math.abs(nx) <= 1 && Math.abs(ny) <= 1 ? [nx, ny] : null;
  };
  const g = LEGS[pose];
  const hits: Record<OpPart, [number, number][]> = { toe: [], shin: [], knee: [], thigh: [] };
  for (const sx of [1, -1]) {
    const hip: V3 = [sx * HIP_W, g.hip[1], g.hip[2]];
    const ank: V3 = [sx * g.foot[0], g.foot[1], g.foot[2]];
    const knee = kneeOf(hip, ank);
    const pts: Record<OpPart, V3[]> = { toe: [[ank[0], 0.03, ank[2] + TOE], ank], shin: [mid(knee, ank)], knee: [knee], thigh: [mid(hip, knee)] };
    for (const k of Object.keys(pts) as OpPart[])
      for (const p of pts[k]) {
        const q = proj(p);
        if (q) hits[k].push(q);
      }
  }
  const parts = (Object.keys(hits) as OpPart[]).filter((k) => hits[k].length);
  const all = parts.flatMap((k) => hits[k]);
  const mx = all.reduce((s, q) => s + q[0], 0) / (all.length || 1);
  const side = mx < -0.4 ? "left" : mx > 0.4 ? "right" : "";
  return { parts, zh: side === "left" ? "左下角" : side === "right" ? "右下角" : "下沿", en: side ? `bottom-${side} corner` : "bottom edge" };
}

export const operatorShows = (op: string | undefined, l: SetLayout | null | undefined) => {
  const o = parseOp(op);
  return Boolean(o.custom || o.hand || o.shadow || (l && operatorView(o.pose, l).parts.length));
};

/** 写进首帧 / 视频提示词：姿态 + 按机位算出来露什么、不露什么 */
export function operatorPrompt(op: string | undefined, l?: SetLayout | null, who?: string): string {
  const o = parseOp(op);
  const bits: string[] = who ? [`The person holding the phone and filming is ${who}; only the parts described below can show.`] : [];
  if (o.custom) bits.push(`The person filming with the phone is partly visible: ${o.custom}.`);
  else {
    const p = poseOf(o.pose);
    const v = l ? operatorView(o.pose, l) : null;
    if (v?.parts.length) {
      const hidden = (Object.keys(PART_EN) as OpPart[]).filter((k) => !v.parts.includes(k));
      bits.push(`The person filming is ${p.en}; from this exact camera angle only ${v.parts.map((k) => PART_EN[k]).join(", ")} show at the ${v.en} of the frame, ${who ? "in the clothes described above" : "in home clothes"}, exactly where the 3D blocking shows them.`);
      if (hidden.length) bits.push(`Do not show ${hidden.map((k) => PART_EN[k]).join(", ")}.`);
    } else if (v) bits.push(`The person filming is ${p.en} behind the phone; from this camera angle none of their body is in frame: no feet, slippers, legs or knees.`);
    else bits.push(`The person filming is ${p.en} behind the phone.`);
  }
  if (o.hand) {
    const fh = freeHand(o);
    bits.push(`Their free ${fh.side} hand (their ${fh.other} hand holds the phone) enters from the bottom-${fh.side} corner of the frame${o.act ? `, ${actOf(o.act)!.en}` : ""}, slightly out of focus, exactly where the 3D blocking shows it. The hand stays small at the edge of the frame for the whole clip: it never moves toward the lens, never grows, and never covers the product or anyone's face.`);
  }
  if (o.shadow) bits.push("Their soft shadow, holding up a phone, falls on the ground in the foreground; it is the only shadow from behind the camera: no second person's shadow appears.");
  bits.push("They are holding the phone, so at most one of their hands can appear and it never holds anything else. Never show the filming person's face. They stay behind the phone for the whole clip and never walk into the frame.");
  return bits.join(" ");
}
