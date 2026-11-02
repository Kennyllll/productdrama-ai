"use client";

import { useState } from "react";
import { MockBadge, PlaceholderFrame, Tag } from "@/components/ui";
import { filmStyles, referenceKindLabels } from "@/lib/mock/demo";
import type { FilmStyle, ReferenceKind } from "@/lib/types";

const kinds: { kind: ReferenceKind; hint: string }[] = [
  { kind: "film", hint: "经典电影的光影、色彩与构图" },
  { kind: "racing", hint: "面向成人买家：速度、机械质感与夜景霓虹" },
  { kind: "game-cg", hint: "暴雪游戏 CG：史诗感、材质与戏剧光" },
];

/** 两级选择：先选类别，再点开某部作品看风格拆解，确认后选用 */
export function FilmStylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const selected = filmStyles.find((f) => f.id === value) ?? filmStyles[0];
  const [kind, setKind] = useState<ReferenceKind>(selected.kind);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = filmStyles.filter((f) => f.kind === kind);

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-300">
        当前选用：<span className="text-amber-200">《{selected.film}》</span>
        <span className="text-neutral-500">（{referenceKindLabels[selected.kind]} · {selected.director}）</span>
      </p>

      <p className="mb-2 text-xs text-neutral-500">第一步 · 选择类别</p>
      <div role="tablist" aria-label="参考作品类别" className="grid gap-3 sm:grid-cols-3">
        {kinds.map(({ kind: k, hint }) => {
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setKind(k);
                setOpenId(null);
              }}
              className={`rounded-xl border p-3 text-left transition ${active ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"}`}
            >
              <p className="font-medium text-white">
                {referenceKindLabels[k]}
                <span className="ml-1 text-xs font-normal text-neutral-500">{filmStyles.filter((f) => f.kind === k).length} 部</span>
              </p>
              <p className="mt-1 text-xs text-neutral-400">{hint}</p>
            </button>
          );
        })}
      </div>

      <p className="mb-2 mt-5 text-xs text-neutral-500">第二步 · 点开作品查看风格拆解，再选用</p>
      <ul aria-label="参考作品" className="space-y-2">
        {visible.map((f) => {
          const open = openId === f.id;
          const chosen = f.id === selected.id;
          return (
            <li key={f.id} className={`rounded-xl border ${chosen ? "border-amber-400" : "border-white/10"}`}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : f.id)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5"
              >
                <span className="text-neutral-500" aria-hidden>
                  {open ? "▾" : "▸"}
                </span>
                <span className="flex-1">
                  <span className="font-medium text-white">《{f.film}》</span>
                  <span className="ml-2 text-xs text-neutral-400">
                    {f.director} · {f.year}
                  </span>
                </span>
                {chosen ? <Tag tone="amber">已选用</Tag> : null}
              </button>
              {open && <StyleDetail film={f} chosen={chosen} onChoose={() => onChange(f.id)} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StyleDetail({ film, chosen, onChoose }: { film: FilmStyle; chosen: boolean; onChoose: () => void }) {
  return (
    <div className="grid gap-5 border-t border-white/10 bg-black/30 p-4 lg:grid-cols-2">
      <div>
        <div className="flex flex-wrap gap-1">
          {film.keywords.map((k) => (
            <Tag key={k}>{k}</Tag>
          ))}
        </div>
        <div className="mt-3 flex h-2 max-w-xs overflow-hidden rounded-full" aria-label={`主色调：${film.palette.map((c) => c.name).join("、")}`}>
          {film.palette.map((c) => (
            <span key={c.hex} className="flex-1" style={{ backgroundColor: c.hex }} title={c.name} />
          ))}
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          {[
            ["光线", film.lighting],
            ["镜头与运镜", film.camera],
            ["构图", film.composition],
            ["建议画幅", film.suggestedAspect],
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
        <p className="mt-2 text-sm text-neutral-200">{film.productTreatment}</p>
        <p className="mt-4 text-xs text-neutral-400">
          产品英雄镜头示例 <MockBadge>文字示例 · 非生成结果</MockBadge>
        </p>
        <ol className="mt-2 grid gap-2 sm:grid-cols-3">
          {film.heroShots.map((h, i) => (
            <li key={h}>
              <PlaceholderFrame label={`英雄镜头 ${i + 1}`} />
              <p className="mt-1 text-xs text-neutral-300">{h}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-1 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-100 lg:col-span-2">
        <p>产品保真：风格只作用于光线、布景、机位与调色；产品的几何、颜色和 Logo 保持原样，调色时对产品区域做颜色保护。</p>
        <p>版权边界：{film.caution}</p>
      </div>
      <div className="lg:col-span-2">
        <button
          type="button"
          onClick={onChoose}
          disabled={chosen}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50"
        >
          {chosen ? "已选用这个风格" : "选用这个风格"}
        </button>
      </div>
    </div>
  );
}
