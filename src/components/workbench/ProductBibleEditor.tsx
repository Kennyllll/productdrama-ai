"use client";

import { useState } from "react";
import type { ProductBibleField } from "@/lib/types";
import { Tag } from "@/components/ui";

export function ProductBibleEditor({ initial }: { initial: ProductBibleField[] }) {
  const [fields, setFields] = useState(initial);
  const pending = fields.filter((f) => f.needsConfirmation).length;

  const update = (key: string, patch: Partial<ProductBibleField>) =>
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  return (
    <div>
      <p className="mb-3 text-xs text-neutral-400">
        无法从照片准确推断的信息需要你确认。待确认：<span className="text-amber-300">{pending}</span> / {fields.length}
      </p>
      <ul className="space-y-2">
        {fields.map((f) => (
          <li key={f.key} className="grid items-center gap-2 rounded-lg bg-white/5 p-3 sm:grid-cols-[6rem_1fr_auto]">
            <label htmlFor={`bible-${f.key}`} className="text-sm text-neutral-300">
              {f.label}
            </label>
            <input
              id={`bible-${f.key}`}
              value={f.value}
              onChange={(e) => update(f.key, { value: e.target.value, needsConfirmation: true })}
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => update(f.key, { needsConfirmation: !f.needsConfirmation })}
              aria-pressed={!f.needsConfirmation}
              className="justify-self-start text-xs"
            >
              {f.needsConfirmation ? <Tag tone="amber">待确认 · 点击确认</Tag> : <Tag tone="emerald">已确认</Tag>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
