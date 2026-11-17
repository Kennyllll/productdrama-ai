// Hook 的 3D 预设：摄影机、产品朝向、人站哪。选了 Hook 就按这条视频的产品位置和尺寸自动摆好，用户只微调。
import type { SetLayout } from "@/lib/production-repo";
import type { FigureSpec } from "@/lib/figures";
import { memberKind, type FamilyMember } from "@/lib/families";
import { stripNeg } from "@/lib/shorts-sync";

export interface HookPerson {
  kind: "child" | "adult";
  pose: "stand" | "crouch" | "ride" | "point" | "reach" | "hold";
  /** 骑在产品上（只有小孩） */
  onProduct?: boolean;
  /** 不骑车时站在产品哪一侧（从车头往前看） */
  side?: "left" | "right" | "behind";
  /** 离产品多远（米，按 KB002 尺寸，自动按产品大小缩放） */
  dist?: number;
  /** 家庭库成员；有就按他的身高 */
  memberId?: string;
  h?: number;
  action?: string;
  actionEn?: string;
}

export interface HookStage {
  /** 摄影机离产品多远（米，按 KB002 尺寸） */
  dist: number;
  camH: number;
  lens: number;
  /** 产品在画面里的朝向：车头正对 / 斜前方 / 侧面 */
  view: "head" | "front34" | "side";
  people: HookPerson[];
}

export const VIEW_LABEL: Record<HookStage["view"], string> = { head: "车头正对镜头", front34: "斜前方", side: "侧面" };
const VIEW_DEG: Record<HookStage["view"], number> = { head: 0, front34: 40, side: 90 };
const KB002_GRIP = 0.51;
const r2 = (n: number) => Math.round(n * 100) / 100;

const who = (p: HookPerson): Partial<FigureSpec> => ({
  ...(p.memberId ? { memberId: p.memberId, h: p.h } : {}),
  ...(p.action ? { action: p.action, actionEn: p.actionEn } : {}),
});

const TOUCH = /车把|把手|握把|扶|握|推|碰|摸|handlebar|\bgrip|\bhold|\btouch|\bsteady|\bpush/i;
const POSES: HookPerson["pose"][] = ["stand", "crouch", "ride", "point", "reach", "hold"];
const SIDES: NonNullable<HookPerson["side"]>[] = ["right", "left", "behind"];
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** AI 按剧情定的出镜人员：只认这条视频家庭里的人、拍摄者不入镜、只有小孩能骑且只能一个、最多 3 人、站位不重叠 */
export function cleanHookPeople(raw: unknown, members: FamilyMember[] | undefined, filmer?: string): { people: HookPerson[]; dropped: string[] } {
  const people: HookPerson[] = [];
  const dropped: string[] = [];
  const used = new Set<string>();
  const sides = new Set<string>();
  let rider = false;
  for (const x of Array.isArray(raw) ? raw.slice(0, 6) : []) {
    if (people.length >= 3) break;
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = str(o.memberId, 40);
    const m = id ? members?.find((y) => y.id === id) : undefined;
    if (id && id === filmer) {
      dropped.push(`${m?.name ?? id} 在拿手机拍，不能入镜，已去掉`);
      continue;
    }
    if (id && !m) {
      dropped.push(`「${id}」不在这条视频的家庭里，已去掉`);
      continue;
    }
    if (m && used.has(m.id)) continue;
    const kind: HookPerson["kind"] = m ? memberKind(m) : o.kind === "adult" ? "adult" : "child";
    const name = m?.name ?? (kind === "adult" ? "大人" : "小孩");
    let pose = POSES.includes(o.pose as HookPerson["pose"]) ? (o.pose as HookPerson["pose"]) : "stand";
    let onProduct = pose === "ride" || o.onProduct === true;
    if (onProduct && (kind === "adult" || rider)) {
      dropped.push(`${name} 不能骑：${kind === "adult" ? "大人不能骑童车" : "一辆车只能一个人骑"}，改成站在车旁`);
      onProduct = false;
    }
    if (onProduct) {
      rider = true;
      pose = "ride";
    } else if (pose === "ride") pose = "stand";
    let side: NonNullable<HookPerson["side"]> = SIDES.includes(o.side as never) ? (o.side as NonNullable<HookPerson["side"]>) : "right";
    if (!onProduct) {
      if (sides.has(side)) side = SIDES.find((y) => !sides.has(y)) ?? side;
      sides.add(side);
    }
    if (m) used.add(m.id);
    let action = str(o.action, 80);
    let actionEn = str(o.actionEn, 200);
    // 3D 里只有骑车的人碰得到车（车把被骑的人握着），旁边的人写扶车 / 碰车就做不出来
    if (!onProduct && pose !== "hold" && TOUCH.test(stripNeg(action))) {
      const ok = pose === "crouch" ? ["蹲在车旁看着", "crouching beside the trike, watching"] : ["站在车旁看着", "standing beside the trike, watching"];
      dropped.push(`${name}「${action}」3D 里做不到（旁边的人碰不到车），改成「${ok[0]}」`);
      action = ok[0];
      actionEn = ok[1];
    }
    people.push({
      kind,
      pose,
      onProduct,
      ...(onProduct ? {} : { side }),
      ...(m ? { memberId: m.id, h: m.heightCm / 100 } : {}),
      ...(action ? { action, actionEn: actionEn || undefined } : {}),
    });
  }
  return { people, dropped };
}

const POSE_ZH: Record<HookPerson["pose"], string> = { stand: "站着", crouch: "蹲着", ride: "骑在车上", point: "指着车", reach: "伸手", hold: "扶着车" };
const SIDE_ZH = { left: "在车左边", right: "在车右边", behind: "在车后面" };
/** 给人看的出镜说明，比如「Leo：骑在车上」 */
export const peopleText = (people: HookPerson[], members?: FamilyMember[]) =>
  people.map((p) => {
    const n = members?.find((m) => m.id === p.memberId)?.name ?? (p.kind === "adult" ? "大人" : "小孩");
    return `${n}：${p.onProduct ? POSE_ZH.ride : `${SIDE_ZH[p.side ?? "right"]}${POSE_ZH[p.pose]}`}${p.action ? `（${p.action}）` : ""}`;
  });

/** 按 Hook 预设摆 3D：产品留在原来的位置和朝向（和场地接得上），摄影机和人围着产品摆 */
export function buildHookLayout(st: HookStage, base: SetLayout | null | undefined, gripY: number): SetLayout {
  const bike: [number, number] = base?.bike ?? [0, 0];
  const yaw = base?.bikeYaw ?? 0;
  const k = Math.max(0.5, Math.min(2, gripY / KB002_GRIP));
  const yr = (yaw * Math.PI) / 180;
  const head = [-Math.sin(yr), Math.cos(yr)];
  const rot = (v: number[], deg: number) => {
    const a = (-deg * Math.PI) / 180;
    return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  };
  const cd = rot(head, VIEW_DEG[st.view]);
  const camPos: [number, number, number] = [r2(bike[0] + cd[0] * st.dist * k), r2(bike[1] + cd[1] * st.dist * k), r2(st.camH)];
  const right = [head[1], -head[0]];
  const figures: FigureSpec[] = st.people.map((p, i) => {
    const id = `h${i + 1}`;
    if (p.onProduct && p.kind === "child") return { id, kind: "child", pose: "ride", onProduct: true, dx: 0, dy: 0, yaw: 0, ...who(p) };
    const dir = p.side === "left" ? [-right[0], -right[1]] : p.side === "behind" ? [-head[0], -head[1]] : right;
    const d = (p.dist ?? 0.7) * k;
    const dx = r2(dir[0] * d);
    const dy = r2(dir[1] * d);
    const face = Math.round((Math.atan2(-dx, -dy) * 180) / Math.PI);
    return { id, kind: p.kind, pose: p.pose === "ride" ? "stand" : p.pose, onProduct: false, dx, dy, yaw: face, ...who(p) };
  });
  return {
    lens: st.lens,
    camPos,
    lookAt: [bike[0], bike[1], r2(0.35 * k)],
    bike,
    bikeYaw: yaw,
    figures,
    figure: figures.length > 0,
    aspect: base?.aspect ?? 9 / 16,
    source: "按 Hook 预设自动摆",
    move: base?.move,
  };
}

/** 自拍：摄影机（手机）在拿手机的人面前约 0.6 米、手机高度，人在画面右边、脸朝镜头，产品在他身后的左边。俯仰角让脸和产品都在画面里 */
export function applySelfie(l: SetLayout, view: HookStage["view"], gripY: number, me: HookPerson): SetLayout {
  const bike: [number, number] = l.bike ?? [0, 0];
  const k = Math.max(0.5, Math.min(2, gripY / KB002_GRIP));
  const yr = ((l.bikeYaw ?? 0) * Math.PI) / 180;
  const head = [-Math.sin(yr), Math.cos(yr)];
  const a = (-VIEW_DEG[view] * Math.PI) / 180;
  const cd = [head[0] * Math.cos(a) - head[1] * Math.sin(a), head[0] * Math.sin(a) + head[1] * Math.cos(a)];
  const fwd = [-cd[0], -cd[1]];
  const rightV = [fwd[1], -fwd[0]];
  const h = me.h ?? (me.kind === "adult" ? 1.75 : 0.95);
  // 规则：自拍时产品完整放在画面左边、不被人挡，比远景大
  const D = 1.0 * k;
  const camH = h * 0.88;
  const cam: [number, number, number] = [r2(bike[0] + cd[0] * D), r2(bike[1] + cd[1] * D), r2(camH)];
  const px = cam[0] + fwd[0] * 0.6 + rightV[0] * 0.45;
  const py = cam[1] + fwd[1] * 0.6 + rightV[1] * 0.45;
  const down = Math.atan((camH - 0.35 * k) / D);
  const up = Math.atan((h * 0.93 - camH) / 0.6);
  // 视线多往下压：产品在地上，要整台落在画面下半部，脸留在上方
  const tilt = up * 0.45 - down * 0.55;
  // 视线往人那边偏 14°：人在画面右边、产品在左边，互不挡
  const turn = (14 * Math.PI) / 180;
  const look = [fwd[0] * Math.cos(turn) + rightV[0] * Math.sin(turn), fwd[1] * Math.cos(turn) + rightV[1] * Math.sin(turn)];
  const lookAt: [number, number, number] = [r2(cam[0] + look[0] * D), r2(cam[1] + look[1] * D), r2(camH + D * Math.tan(tilt))];
  const yaw = Math.round((Math.atan2(cam[0] - px, cam[1] - py) * 180) / Math.PI);
  const self: FigureSpec = { id: "self", kind: me.kind, pose: me.pose === "ride" ? "stand" : me.pose, onProduct: false, dx: r2(px - bike[0]), dy: r2(py - bike[1]), yaw, ...who(me) };
  const figures = [...(l.figures ?? []).filter((f) => f.id !== "self" && (!me.memberId || f.memberId !== me.memberId)), self];
  // 3D 里焦段按 36mm 宽算横向视角；手机前置约 26mm（等效），竖拍横向约 50°，这里就是 40mm
  return { ...l, lens: 26, camPos: cam, lookAt, figures, figure: true, source: "自拍：按 Hook 预设自动摆" };
}

/** 按名字给预置 Hook 的 3D 预设；自己建的 Hook 没写就用这个 */
export const DEFAULT_STAGE: HookStage = { dist: 2, camH: 1, lens: 28, view: "front34", people: [{ kind: "child", pose: "ride", onProduct: true }] };
