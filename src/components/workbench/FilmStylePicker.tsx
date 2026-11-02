"use client";

import { useState } from "react";
import { MockBadge, PlaceholderFrame, Tag } from "@/components/ui";
import { filmStyles, referenceKindLabels } from "@/lib/mock/demo";
import type { ReferenceKind } from "@/lib/types";

const kindFilters: (ReferenceKind | "all")[] = ["all", "film", "racing", "game-cg"];

export function FilmStylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [kind, setKind] = useState<ReferenceKind | "all">("all");
  const selected = filmStyles.find((f) => f.id === value) ?? filmStyles[0];
  const visible = kind === "all" ? filmStyles : filmStyles.filter((f) => f.kind === kind);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {kindFilters.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? "bg-amber-400 text-black" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`}
          >
            {k === "all" ? "全部" : referenceKindLabels[k]}（{k === "all" ? filmStyles.length : filmStyles.filter((f) => f.kind === k).length}）
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="参考作品" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((f) => {
          const active = f.id === selected.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f.id)}
              className={`rounded-xl border p-3 text-left transition ${active ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"}`}
            >
              <div className="flex h-6 overflow-hidden rounded" aria-hidden>
                {f.palette.map((c) => (
                  <span key={c.hex} className="flex-1" style={{ backgroundColor: c.hex }} />
                ))}
              </div>
              <p className="mt-2 flex items-center justify-between gap-2 font-medium text-white">
                《{f.film}》<span className="text-xs font-normal text-neutral-500">{referenceKindLabels[f.kind]}</span>
              </p>
              <p className="text-xs text-neutral-400">
                {f.director} · {f.year}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {f.keywords.map((k) => (
                  <Tag key={k}>{k}</Tag>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 rounded-xl border border-white/10 bg-black/30 p-4 lg:grid-cols-2">
        <div>
          <p className="text-lg font-medium text-white">
            《{selected.film}》风格拆解 <span className="text-sm text-neutral-400">{selected.director} · {selected.year}</span>
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {selected.palette.map((c) => (
              <li key={c.hex} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 text-xs">
                <span className="h-4 w-4 rounded" style={{ backgroundColor: c.hex }} aria-hidden />
                {c.name} <span className="text-neutral-500">{c.hex}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ["光线", selected.lighting],
              ["镜头与运镜", selected.camera],
              ["构图", selected.composition],
              ["建议画幅", selected.suggestedAspect],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="text-neutral-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-300">产品在这个风格下怎么拍</p>
          <p className="mt-2 text-sm text-neutral-200">{selected.productTreatment}</p>
          <p className="mt-4 text-xs text-neutral-400">
            产品英雄镜头示例 <MockBadge>文字示例 · 非生成结果</MockBadge>
          </p>
          <ol className="mt-2 grid gap-2 sm:grid-cols-3">
            {selected.heroShots.map((h, i) => (
              <li key={h}>
                <PlaceholderFrame label={`英雄镜头 ${i + 1}`} />
                <p className="mt-1 text-xs text-neutral-300">{h}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-1 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-100 lg:col-span-2">
          <p>产品保真：风格只作用于光线、布景、机位与调色；产品的几何、颜色和 Logo 保持原样，调色时对产品区域做颜色保护。</p>
          <p>版权边界：{selected.caution}</p>
        </div>
      </div>
    </div>
  );
}
