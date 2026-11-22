"use client";

import type { SetLayout } from "@/lib/production-repo";
import { actOf, freeHand, HAND_ACTS, OP_POSES, operatorView, opString, parseOp, PART_LABEL, poseOf, type HandAct, type OpPose } from "@/lib/shorts-operator";

/** 拍摄者：先选姿态（和“空着的手 / 影子”），露出什么按机位自动算 */
export function OperatorPicker({
  value,
  onChange,
  disabled,
  layout,
  onPose,
  scale = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  layout?: SetLayout | null;
  /** 选了姿态后把机位高度设成这个姿态的默认值 */
  onPose?: (camH: number) => void;
  /** 拿手机的人身高 / 1.75 米：默认机位高度和合理范围跟着缩放 */
  scale?: number;
}) {
  const o = parseOp(value);
  const set = (p: Partial<typeof o>) => onChange(opString({ ...o, custom: undefined, ...p }));
  const p = poseOf(o.pose);
  const v = layout && !o.custom ? operatorView(o.pose, layout) : null;
  const camH = layout?.camPos[2];
  const off = camH !== undefined && !o.custom && (camH < p.lo * scale || camH > p.hi * scale);
  const fit = off ? OP_POSES.find((x) => camH! >= x.lo * scale && camH! <= x.hi * scale) : undefined;
  const box = "rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white disabled:opacity-50";
  return (
    <div className="space-y-1 text-xs text-neutral-300">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={o.custom ? "custom" : o.pose}
          disabled={disabled}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "custom") return onChange("在这里写拍摄者露出什么");
            set({ pose: id as OpPose });
            onPose?.(Math.round(poseOf(id as OpPose).camH * scale * 100) / 100);
          }}
          className={box}
        >
          {OP_POSES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}拍
            </option>
          ))}
          <option value="custom">自己写…</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={o.hand} disabled={disabled || !!o.custom} onChange={(e) => set({ hand: e.target.checked })} />
          空着的手入镜{o.custom ? "" : `（${freeHand(o).zh}）`}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={o.shadow} disabled={disabled || !!o.custom} onChange={(e) => set({ shadow: e.target.checked })} />
          影子
        </label>
      </div>
      {o.hand && !o.custom ? (
        <div className="flex flex-wrap items-center gap-2">
          <select value={o.phone} disabled={disabled} onChange={(e) => set({ phone: e.target.value as "R" | "L" })} className={box}>
            <option value="R">右手拿手机 → 左手入镜</option>
            <option value="L">左手拿手机 → 右手入镜</option>
          </select>
          <select value={o.act ?? ""} disabled={disabled} onChange={(e) => set({ act: (e.target.value || null) as HandAct | null })} className={`${box} ${o.act ? "" : "border-amber-400/70"}`}>
            <option value="">选动作（必填）</option>
            {HAND_ACTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {o.custom ? (
        <input key={value} defaultValue={o.custom} disabled={disabled} onBlur={(e) => e.target.value !== o.custom && onChange(e.target.value)} className={`${box} w-full`} />
      ) : null}
      {v ? (
        <p className="text-sky-300">
          按机位自动算：{v.parts.length ? `画面${v.zh}露出拍摄者的${v.parts.map((k) => PART_LABEL[k]).join("、")}` : "拍摄者的身体不入镜（拍不到脚和腿）"}
          {o.hand ? `；${freeHand(o).zh}从画面${freeHand(o).side === "left" ? "左" : "右"}下角伸进来（${actOf(o.act)?.label ?? "动作还没选"}）` : ""}
          {o.shadow ? "；地上有影子" : ""}
        </p>
      ) : null}
      {off ? (
        <p className="flex flex-wrap items-center gap-2 text-amber-300">
          机位离地 {camH!.toFixed(2)} 米，不像{p.label}拍（一般 {p.lo}–{p.hi} 米）
          {fit && !disabled ? (
            <button type="button" className="rounded border border-amber-400/50 px-2 py-0.5 text-amber-200" onClick={() => set({ pose: fit.id })}>
              改成{fit.label}拍
            </button>
          ) : null}
          {onPose && !disabled ? (
            <button type="button" className="rounded border border-amber-400/50 px-2 py-0.5 text-amber-200" onClick={() => onPose(Math.round(p.camH * scale * 100) / 100)}>
              机位调到 {(p.camH * scale).toFixed(2)} 米
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
