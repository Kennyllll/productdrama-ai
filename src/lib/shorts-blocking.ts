// 按 3D 摆位自动写出“画面里有什么、在哪里、什么姿态”。每次保存 3D 都会变，提示词以这段为准。
import type { SetLayout } from "@/lib/production-repo";
import { figureDims, figuresOf, presetPose, rideOf, type FigureSpec, type P3, type ProductRig } from "@/lib/figures";
import { facingText } from "@/lib/shorts-set";

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 世界点 → 画面坐标（nx 左 -1 右 1，ny 下 -1 上 1，z = 离镜头深度） */
function projector(l: SetLayout) {
  const C = l.camPos as V3;
  const f = norm(sub(l.lookAt as V3, C));
  let r = cross(f, [0, 0, 1]);
  if (Math.hypot(...r) < 1e-6) r = [1, 0, 0];
  r = norm(r);
  const u = cross(r, f);
  const tanH = 18 / l.lens;
  const tanV = tanH / (l.aspect || 9 / 16);
  return (p: V3) => {
    const d = sub(p, C);
    const z = dot(d, f);
    return { nx: z > 0.05 ? dot(d, r) / z / tanH : NaN, ny: z > 0.05 ? dot(d, u) / z / tanV : NaN, z };
  };
}

/** 场地物件在这一镜里看不看得到：返回画面横向位置和最近深度；看不到返回 null */
export function itemSight(l: SetLayout) {
  const proj = projector(l);
  const G = [-0.5, -0.25, 0, 0.25, 0.5];
  return (i: { x: number; y: number; z: number; w: number; d: number; h: number; yaw: number }) => {
    const a = (i.yaw * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let n = 0;
    let sx = 0;
    let zmin = Infinity;
    for (const u of G)
      for (const v of G)
        for (const t of [0, 0.5, 1]) {
          const lx = u * i.w;
          const ly = v * i.d;
          const p = proj([i.x + lx * c - ly * s, i.y + lx * s + ly * c, i.z + t * i.h]);
          if (p.z > 0.05 && Math.abs(p.nx) <= 1 && Math.abs(p.ny) <= 1) {
            n++;
            sx += p.nx;
            zmin = Math.min(zmin, p.z);
          }
        }
    return n ? { nx: sx / n, z: zmin } : null;
  };
}

/** 产品姿态：平放 / 抬起 / 侧倒 / 斜靠 / 车头抬起 */
function poseOfProduct(l: SetLayout): string {
  const lift = (l.bikeLift ?? 0) - (l.bikeGround ?? 0);
  const pitch = l.bikePitch ?? 0;
  const roll = l.bikeRoll ?? 0;
  const bits: string[] = [];
  if (Math.abs(roll) >= 135) bits.push("lies upside down on the ground, wheels in the air");
  else if (Math.abs(roll) >= 60) bits.push(`lies tipped over on its ${roll > 0 ? "left" : "right"} side on the ground`);
  else if (Math.abs(roll) >= 8) bits.push(`leans over about ${Math.round(Math.abs(roll))}° to its ${roll > 0 ? "left" : "right"} side (resting against something)`);
  if (Math.abs(pitch) >= 60) bits.push(`stands up almost vertically on its ${pitch > 0 ? "rear" : "front"} end`);
  else if (Math.abs(pitch) >= 8) bits.push(`with its front end ${pitch > 0 ? "raised" : "tipped down"} about ${Math.round(Math.abs(pitch))}°`);
  if (lift >= 0.08) bits.push(`lifted about ${lift.toFixed(1)} m off the ground (held or resting on something)`);
  return bits.length ? bits.join(", ") + "," : "stands upright on its wheels on the ground";
}

const hPos = (nx: number) => (nx < -0.33 ? "left third" : nx > 0.33 ? "right third" : "center");
const vPos = (ny: number) => (ny < -0.33 ? "lower part" : ny > 0.33 ? "upper part" : "middle");
const POSE_EN: Record<string, string> = {
  stand: "standing",
  crouch: "crouching down",
  ride: "sitting on the product's seat, riding it, hands on the grips",
  sit: "sitting on the ground",
  hold: "standing with both hands reaching forward",
  reach: "reaching one hand forward (an open, empty-handed gesture, not handing anything over)",
  point: "pointing forward and slightly down with one index finger",
};

/** 这个人在做什么：用户写的动作为准；手脚拖过但没写动作，就照 3D 人偶的样子，不用姿态名 */
/** 骑车时脚在哪：量过脚踏高度（三轮车）= 踩脚踏，否则（平衡车）= 踩地 */
const rideFeet = (rig: ProductRig | null | undefined) => (rig?.footY !== undefined ? "both feet on the pedals" : "feet on the ground");

function doing(f: FigureSpec, l: SetLayout, rig?: ProductRig | null): string {
  const ride = f.onProduct && !!l.bike;
  if (f.actionEn) return `${ride ? `sitting on the product's seat with ${rideFeet(rig)}, ` : ""}${f.actionEn.replace(/[.\s]+$/, "")}`;
  if (f.custom) return ride ? "sitting on the product's seat, posed exactly like this person's mannequin in the 3D blocking render" : "posed exactly like this person's mannequin in the 3D blocking render";
  if (ride) return `${POSE_EN.ride}, ${rideFeet(rig)}`;
  return POSE_EN[effPose(f)] ?? f.pose;
}

/** 不在产品上时，“骑”姿态在 3D 里按站着摆（和 Set3D 一致） */
const effPose = (f: FigureSpec) => (f.pose === "ride" ? "stand" : f.pose);
const jointsOf = (f: FigureSpec, rig: ProductRig | null | undefined) => ({ ...presetPose(f.kind, effPose(f), rig ? rideOf(rig) : undefined, f.h), ...f.custom });

/** 人偶本地点（+z 朝前，+x 人偶左边，y 向上）→ three.js 坐标；和 Set3D 摆人偶的方式一致 */
function toThree(f: Pick<FigureSpec, "onProduct" | "dx" | "dy" | "yaw">, l: SetLayout, rig: ProductRig, p: P3): V3 {
  const yawR = ((l.bikeYaw ?? 0) * Math.PI) / 180;
  const bx = l.bike?.[0] ?? 0;
  const by = l.bike?.[1] ?? 0;
  const ride = f.onProduct && !!l.bike;
  const th = ride ? yawR + Math.PI : Math.PI - (f.yaw * Math.PI) / 180;
  const px = ride ? bx + Math.sin(yawR) * rig.seatBack : bx + f.dx;
  const pz = ride ? -by + Math.cos(yawR) * rig.seatBack : -(by + f.dy);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [p[0] * c + p[2] * s + px, p[1], -p[0] * s + p[2] * c + pz];
}

/** 两只手各碰到产品哪里（3D 里离接触点 12 cm 以内）：grip = 车把握把，seat = 座椅 */
export function handContacts(f: FigureSpec, l: SetLayout, rig: ProductRig | null | undefined): ("grip" | "seat" | null)[] {
  if (!rig || !l.bike || f.onProduct) return [null, null];
  const r = rideOf(rig);
  const onSeat = { onProduct: true, dx: 0, dy: 0, yaw: 0 };
  const grips = [toThree(onSeat, l, rig, [r.gripX, r.gripY, r.gripZ]), toThree(onSeat, l, rig, [-r.gripX, r.gripY, r.gripZ])];
  const seat = toThree(onSeat, l, rig, [0, r.seatY, 0]);
  const near = (a: V3, b: V3) => Math.hypot(...sub(a, b)) < 0.12;
  const j = jointsOf(f, rig);
  // 只看拖过的手：预设姿态的手垂在身边，离座椅近只是巧合，不算“碰到”
  return (["handL", "handR"] as const).map((k) => {
    if (!f.custom?.[k]) return null;
    const w = toThree(f, l, rig, j[k]);
    return grips.some((g) => near(w, g)) ? "grip" : near(w, seat) ? "seat" : null;
  });
}

/** 身体和地面 / 产品的关系：3D 事实写成固定句子，不写的话生图模型会按最常见的画法补（比如扶车把就画成骑车） */
function bodyFacts(f: FigureSpec, l: SetLayout, rig: ProductRig | null | undefined): string {
  if (f.onProduct && l.bike) return "";
  const pose = effPose(f);
  const j = jointsOf(f, rig);
  const lift = figureDims(f.kind, f.h).ankle + 0.08;
  const up = [j.footL, j.footR].filter((q) => q[1] > lift).length;
  const base = pose === "sit" ? "sitting on the ground" : pose === "crouch" ? "crouching" : "standing";
  const feet = pose === "sit" ? "" : up === 0 ? " with both feet on the ground" : up === 1 ? " with one foot lifted off the ground" : " with both feet off the ground";
  const hands = handContacts(f, l, rig);
  const g = hands.filter((h) => h === "grip").length;
  const touch = g === 2 ? "both hands on the product's handlebar grips" : g === 1 ? "one hand on a handlebar grip" : hands.includes("seat") ? "one hand on the product's seat" : "";
  return [base + feet, touch].filter(Boolean).join(", ");
}

function figPos(f: FigureSpec, l: SetLayout): [number, number] {
  const bx = l.bike?.[0] ?? 0;
  const by = l.bike?.[1] ?? 0;
  return f.onProduct && l.bike ? [bx, by] : [bx + f.dx, by + f.dy];
}

/** 面朝：相对镜头（北 = 0°）；骑在产品上的跟车头 */
function facingWord(f: FigureSpec, l: SetLayout): string {
  // 骑车的人跟车头：车头方向 (-sin, cos) 换成和人偶 yaw 一样的“北 = 0°、顺时针”
  const yaw = f.onProduct && l.bike ? -(l.bikeYaw ?? 0) : f.yaw;
  const camYaw = (Math.atan2(l.lookAt[0] - l.camPos[0], l.lookAt[1] - l.camPos[1]) * 180) / Math.PI;
  const d = (((yaw - camYaw) % 360) + 540) % 360 - 180; // 0 = 背对镜头，±180 = 面向镜头
  const a = Math.abs(d);
  if (a > 135) return "facing the camera";
  if (a < 45) return "with their back to the camera";
  return d > 0 ? "turned toward frame right" : "turned toward frame left";
}

/** 3D 摆位描述（英文，写进首帧提示词） */
export function blockingText(l: SetLayout | null | undefined, rig?: ProductRig | null): string {
  if (!l) return "";
  const proj = projector(l);
  const out: string[] = [];
  if (l.bike) {
    const base = proj([l.bike[0], l.bike[1], 0]);
    const top = proj([l.bike[0], l.bike[1], 0.6]);
    const mid = proj([l.bike[0], l.bike[1], 0.3]);
    const size = Number.isFinite(base.ny) && Number.isFinite(top.ny) ? Math.abs(top.ny - base.ny) / 2 : NaN;
    const sz = !Number.isFinite(size) ? "" : size > 0.45 ? ", filling a large part of the frame" : size > 0.2 ? ", medium size in the frame" : ", small in the frame";
    out.push(
      Number.isFinite(mid.nx) && Math.abs(mid.nx) <= 1.1 && Math.abs(mid.ny) <= 1.1
        ? `The product ${poseOfProduct(l)} in the ${vPos(mid.ny)} ${hPos(mid.nx)} of the frame, about ${mid.z.toFixed(1)} m from the camera${sz}; ${facingText(l).replace(/^[^:]*:\s*/, "").replace(/\.$/, "")}.`
        : "The product is outside the frame in this shot.",
    );
  }
  const figs = figuresOf(l);
  if (!figs.length) out.push("No people are in the frame except what is described for the person filming.");
  figs.forEach((f, k) => {
    const [x, y] = figPos(f, l);
    const head = proj([x, y, figureDims(f.kind, f.h).H * 0.9]);
    const feet = proj([x, y, 0]);
    const who = f.kind === "adult" ? "an adult" : "a small child";
    const inFrame = Number.isFinite(feet.nx) && (Math.abs(feet.nx) <= 1.1 || Math.abs(head.nx) <= 1.1);
    if (!inFrame) return void out.push(`Person ${k + 1} (${who}) is outside the frame.`);
    let rel = "";
    const facts = bodyFacts(f, l, rig);
    if (l.bike && !(f.onProduct && l.bike)) {
      const pb = proj([l.bike[0], l.bike[1], 0.3]);
      const dist = Math.hypot(x - l.bike[0], y - l.bike[1]);
      const side = feet.nx < pb.nx - 0.08 ? "to the left of" : feet.nx > pb.nx + 0.08 ? "to the right of" : feet.z < pb.z ? "in front of" : "behind";
      rel = `, ${side} the product, about ${dist.toFixed(1)} m from it`;
      // 离得近（尤其手扶车）时生图模型常画成跨在车上：写死不骑不跨；稍远只提一句，省提示词字数
      const touching = handContacts(f, l, rig).some(Boolean);
      if (dist < 0.8) rel += touching || dist < 0.4 ? ", beside it, not sitting on, riding or straddling it (not between their legs)" : ", not riding it";
      if (dist < 0.8 && rig && (f.custom?.handL || f.custom?.handR) && !touching) rel += ", hands not touching it";
    }
    const cut = head.ny > 1 ? " (head cropped by the top edge)" : feet.ny < -1 ? " (feet cropped by the bottom edge)" : "";
    // 没写动作也没拖手脚时，“standing / sitting on the ground” 已经在 facts 里，不重复
    const plain = !f.actionEn && !f.custom && ["stand", "sit", "crouch"].includes(effPose(f));
    const act = [plain && facts ? "" : doing(f, l, rig), facts].filter(Boolean).join(", ");
    out.push(`Person ${k + 1}: ${who}, ${act}, ${facingWord(f, l)}, in the ${hPos(feet.nx)} of the frame, about ${feet.z.toFixed(1)} m from the camera${rel}${cut}${f.custom && !f.actionEn ? "; arms and legs exactly as posed in the 3D blocking" : ""}.`);
  });
  out.push(`Exactly ${figs.length} ${figs.length === 1 ? "person" : "people"} in the frame, nobody else.`);
  return out.join(" ");
}

/** 摆位指纹：产品 / 人偶 / 机位任何变化都会变（文字过期检查用） */
export function blockingKey(l: SetLayout | null | undefined): string {
  if (!l) return "";
  const r = (n: number) => Math.round(n * 20) / 20;
  return JSON.stringify([l.lens, l.camPos.map(r), l.lookAt.map(r), l.bike?.map(r), Math.round(l.bikeYaw ?? 0), r(l.bikeLift ?? 0), Math.round(l.bikePitch ?? 0), Math.round(l.bikeRoll ?? 0), figuresOf(l).map((f) => [f.kind, f.pose, f.action ?? "", f.onProduct, r(f.dx), r(f.dy), Math.round(f.yaw), f.custom ?? null])]);
}
