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
