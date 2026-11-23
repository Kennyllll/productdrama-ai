"use client";

// 产品细节一行：没填不能勾「已确认」；适用年龄用 最小 / 最大 / 单位。
import { useState } from "react";
import { checkAgeRange, formatAge, parseAge, type AgeUnit } from "@/lib/age-range";
import type { ProductBibleField } from "@/lib/types";

const inp = "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white focus:border-amber-400 focus:outline-none";

export function BibleRow({ f, form }: { f: ProductBibleField; form: string }) {
  const old = f.key === "age" ? parseAge(f.value) : null;
  const [value, setValue] = useState(f.value);
  const [min, setMin] = useState(old ? String(old.min) : "");
  const [max, setMax] = useState(old ? String(old.max) : "");
  const [unit, setUnit] = useState<AgeUnit>(old?.unit ?? "岁");
  const [checked, setChecked] = useState(!f.needsConfirmation);
  const age = f.key === "age" ? checkAgeRange(min, max, unit) : null;
  const ageErr = age && "error" in age ? age.error : "";
  const filled = f.key === "age" ? !!age && "range" in age && !!age.range : !!value.trim();
  const ok = checked && filled;
  return (
    <li className="grid items-center gap-2 rounded-lg bg-white/5 p-2 sm:grid-cols-[6rem_1fr_auto]">
      <label htmlFor={`bible-${f.key}`} className="text-sm text-neutral-300">
        {f.label}
      </label>
      {f.key === "age" ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input id={`bible-${f.key}`} form={form} name="age.min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="最小" aria-label="适用年龄最小" className={`${inp} w-20`} />
            <span className="text-neutral-500">到</span>
            <input form={form} name="age.max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="最大" aria-label="适用年龄最大" className={`${inp} w-20`} />
            <select form={form} name="age.unit" value={unit} onChange={(e) => setUnit(e.target.value as AgeUnit)} aria-label="单位" className={`${inp} w-20`}>
              <option value="岁">岁</option>
              <option value="月">月</option>
            </select>
          </div>
          {ageErr ? <p className="text-xs text-rose-300">{ageErr}</p> : f.value && !old ? <p className="text-xs text-amber-300">原来写的「{f.value}」看不懂，请重填</p> : null}
          {age && "range" in age && age.range ? <p className="text-[11px] text-neutral-500">会存成：{formatAge(age.range)}</p> : null}
        </div>
      ) : (
        <input id={`bible-${f.key}`} form={form} name={`bible.${f.key}.value`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} placeholder="待填写" className={inp} />
      )}
      <div className="flex flex-col items-start">
        <label title={filled ? "" : "先填内容才能勾"} className={`flex items-center gap-1 text-xs ${filled ? "text-neutral-300" : "invisible"}`}>
          <input type="checkbox" form={form} name={`bible.${f.key}.confirmed`} checked={ok} disabled={!filled} onChange={(e) => setChecked(e.target.checked)} />
          已确认
        </label>
      </div>
    </li>
  );
}
