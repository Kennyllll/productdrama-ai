// 生成前自查：文字 / 人偶动作栏和 3D 对不上的地方（免费，不调 AI）。审批框里列出来，用户确认后才能花钱。
import type { SetLayout } from "@/lib/production-repo";
import { figuresOf, type ProductRig } from "@/lib/figures";
import type { Conflict, ShortShot } from "@/lib/shorts";
import { handContacts } from "@/lib/shorts-blocking";
import { stripNeg } from "@/lib/shorts-sync";

const RIDE_EN = /\b(?:rid(?:e|es|ing)\b|straddl\w*|astride|seated on|sit(?:s|ting)? on (?:the |its |a )?(?:bike|seat|saddle|product|balance))/i;
const RIDE_ZH = /骑|跨坐|跨在|坐在(?:车|平衡车|座)/;
const HANDLE = /车把|把手|握把|handlebar/i;
const neg = (t: string) => stripNeg(t).replace(/(?:不|别|没)(?:要|是|能|在|有)?(?:骑|跨|坐|蹲)[^，。；,.;]*/g, " ");

export function promptConflicts(s: Pick<ShortShot, "layout" | "description" | "framePrompt" | "motionPrompt">, rig: ProductRig | null | undefined): Conflict[] {
  const l: SetLayout | null = s.layout;
  if (!l) return [];
  const figs = figuresOf(l);
  const out: Conflict[] = [];
  const text = (msg: string) => out.push({ msg, fix: "text" });
  const riding = figs.some((f) => f.onProduct && l.bike);
  if (!riding && l.bike) {
    for (const [name, t] of [["画面描述", s.description], ["画面细节", s.framePrompt], ["运动提示词", s.motionPrompt]] as const) {
      const x = neg(t ?? "");
      const m = x.match(RIDE_EN) ?? x.match(RIDE_ZH);
      if (m) text(`「${name}」里写了「${m[0]}」，3D 里没有人坐在产品上：模型可能画成骑车`);
    }
  }
  figs.forEach((f, k) => {
    const who = `人偶${k + 1}·${f.kind === "adult" ? "大人" : "小孩"}`;
    const a = neg(f.action ?? "");
    const ride = f.onProduct && !!l.bike;
    const fig = (msg: string) => out.push({ msg, fix: "3d", fig: f.id });
    if (!ride && RIDE_ZH.test(a)) fig(`${who}的动作写「${f.action}」，3D 里没在产品上`);
    if (ride && /站|蹲/.test(a)) fig(`${who}的动作写「${f.action}」，3D 里是坐在产品上`);
    if (!ride && /蹲/.test(a) && f.pose !== "crouch") fig(`${who}的动作写了蹲，3D 人偶不是蹲姿`);
    if (!ride && /坐/.test(a) && !RIDE_ZH.test(a) && f.pose !== "sit") fig(`${who}的动作写了坐，3D 人偶不是坐姿`);
    if (!ride && rig && l.bike) {
      const grips = handContacts(f, l, rig).filter((h) => h === "grip").length;
      if (HANDLE.test(a) && !grips) fig(`${who}的动作写扶车把，3D 里手没碰到车把`);
      if (grips && !HANDLE.test(a) && !/扶|握|推/.test(a)) fig(`${who}在 3D 里手放在车把上，动作栏没写${f.action ? "" : "（动作栏是空的）"}`);
    }
  });
  return out;
}

/** 3D 做得到的动作（给 AI 写错的动作兜底）：骑车的坐座椅握车把，旁边的人按姿势站 / 蹲 / 坐着看 */
export function safeAction(f: ReturnType<typeof figuresOf>[number], l: SetLayout, rig: ProductRig | null | undefined): { action: string; actionEn: string } {
  if (f.onProduct && l.bike)
    return rig?.footY !== undefined
      ? { action: "坐在座椅上，双手握车把，双脚踩在脚踏上", actionEn: "sitting on the saddle, both hands on the handlebar grips, both feet on the pedals" }
      : { action: "坐在座椅上，双手握车把", actionEn: "sitting on the saddle, both hands on the handlebar grips" };
  const kid = figuresOf(l).some((x) => x.id !== f.id && x.kind === "child");
  const at = kid ? ["看着孩子", "watching the child"] : ["看着车", "looking at the trike"];
  const grips = rig && l.bike ? handContacts(f, l, rig).includes("grip") : false;
  if (grips) return { action: "站在车旁，一只手扶着车把", actionEn: "standing beside the trike, one hand on the handlebar" };
  if (f.pose === "crouch") return { action: `蹲在车旁${at[0]}`, actionEn: `crouching beside the trike, ${at[1]}` };
  if (f.pose === "sit") return { action: `坐着${at[0]}`, actionEn: `sitting, ${at[1]}` };
  return { action: `站在车旁${at[0]}`, actionEn: `standing beside the trike, ${at[1]}` };
}

/** 人偶动作栏写了 3D 做不到的（AI 写的扶车把、骑车等），换成做得到的；返回改了什么，给人看 */
export function fitFigureActions(l: SetLayout | null, rig: ProductRig | null | undefined): string[] {
  if (!l?.figures?.length) return [];
  const bad = new Set(promptConflicts({ layout: l, description: "", framePrompt: "", motionPrompt: "" }, rig).flatMap((c) => (c.fix === "3d" && c.fig ? [c.fig] : [])));
  const notes: string[] = [];
  l.figures = l.figures.map((f, k) => {
    if (!bad.has(f.id)) return f;
    const ok = safeAction(f, l, rig);
    notes.push(`人偶${k + 1}「${f.action || "（空）"}」3D 里做不到，改成「${ok.action}」`);
    return { ...f, ...ok };
  });
  return notes;
}
