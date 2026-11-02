"use client";

import { useState } from "react";
import { Card, LaterButton, MockBadge, Tag } from "@/components/ui";
import { FilmStylePicker } from "@/components/workbench/FilmStylePicker";
import { filmStyles, productRoles, storyProposals, themeLibrary } from "@/lib/mock/demo";

type EntryMode = "ai" | "library" | "free";

const entryModes: { key: EntryMode; label: string; hint: string }[] = [
  { key: "ai", label: "AI 推荐", hint: "根据产品信息推荐主题组合（当前为示例推荐）" },
  { key: "library", label: "主题库", hint: "从主题库中自由组合多个主题" },
  { key: "free", label: "自由创作", hint: "用自然语言描述你的故事想法" },
];

const aiSuggestions = [
  { label: "冒险 + 友情 + 奇幻", ids: ["adventure", "friendship", "fantasy"] },
  { label: "运动竞技 + 友情", ids: ["sports", "friendship"] },
  { label: "亲子温情 + 自然", ids: ["family", "nature"] },
];

const labelOf = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;

export function CreativeWorkbench() {
  const [mode, setMode] = useState<EntryMode>("ai");
  const [themes, setThemes] = useState<string[]>(["adventure", "friendship", "fantasy"]);
  const [freeText, setFreeText] = useState("");
  const [styleId, setStyleId] = useState("et");
  const [roleId, setRoleId] = useState("companion");
  const [selectedId, setSelectedId] = useState(storyProposals[0].id);
  const [loglines, setLoglines] = useState<Record<string, string>>(
    Object.fromEntries(storyProposals.map((p) => [p.id, p.logline])),
  );

  const toggleTheme = (id: string) =>
    setThemes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const selected = storyProposals.find((p) => p.id === selectedId)!;

  return (
    <div className="space-y-6">
      <Card title="1 · 故事主题">
        <div role="tablist" aria-label="主题入口" className="mb-4 flex flex-wrap gap-2">
          {entryModes.map((m) => (
            <button
              key={m.key}
              role="tab"
              type="button"
              aria-selected={mode === m.key}
              onClick={() => setMode(m.key)}
              className={`rounded-lg px-3 py-1.5 text-sm ${mode === m.key ? "bg-amber-400 text-black" : "bg-white/5 hover:bg-white/10"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-neutral-400">{entryModes.find((m) => m.key === mode)?.hint}</p>

        {mode === "ai" && (
          <div className="flex flex-wrap gap-2">
            {aiSuggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setThemes(s.ids)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:border-amber-400"
              >
                {s.label} <MockBadge>示例推荐</MockBadge>
              </button>
            ))}
          </div>
        )}
        {mode === "library" && (
          <div className="flex flex-wrap gap-2">
            {themeLibrary.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={themes.includes(t.id)}
                onClick={() => toggleTheme(t.id)}
                title={t.description}
                className={`rounded-full border px-3 py-1 text-sm ${
                  themes.includes(t.id) ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-white/15 hover:border-white/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {mode === "free" && (
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
            aria-label="自由创作描述"
            placeholder="例如：一个怕黑的孩子，在滑板车灯光的陪伴下完成一次夜间探险……"
            className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm focus:border-amber-400 focus:outline-none"
          />
        )}
        <p className="mt-4 text-sm text-neutral-300">
          已选主题：
          {themes.length ? themes.map((id) => <Tag key={id}>{labelOf(themeLibrary, id)}</Tag>) : <span className="text-neutral-500">未选择</span>}
        </p>
      </Card>

      <Card title="2 · 电影视觉风格（参考作品：电影 / 赛车电影 / 游戏 CG）">
        <FilmStylePicker value={styleId} onChange={setStyleId} />
      </Card>
      <Card title="3 · 产品在剧情中的角色">
        <OptionGrid options={productRoles} value={roleId} onChange={setRoleId} name="product-role" />
      </Card>

      <Card title="4 · 三个故事提案" aside={<LaterButton task="TASK-003">重新推荐</LaterButton>}>
        <p className="mb-3 text-xs text-neutral-400">以下为预置示例提案，并非 AI 实时生成。选择一个提案后可修改故事梗概。</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {storyProposals.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedId(p.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-white">{p.title}</p>
                  {active ? <Tag tone="amber">已选择</Tag> : null}
                </div>
                <p className="mt-2 text-sm text-neutral-300">{loglines[p.id]}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.themeIds.map((id) => (
                    <Tag key={id}>{labelOf(themeLibrary, id)}</Tag>
                  ))}
                  <Tag tone="emerald">《{filmStyles.find((f) => f.id === p.visualStyleId)?.film}》风格</Tag>
                  <Tag tone="rose">产品：{labelOf(productRoles, p.productRoleId)}</Tag>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-5 rounded-lg bg-white/5 p-4">
          <label htmlFor="logline" className="text-sm text-neutral-300">
            修改「{selected.title}」故事梗概
          </label>
          <textarea
            id="logline"
            rows={2}
            value={loglines[selectedId]}
            onChange={(e) => setLoglines((prev) => ({ ...prev, [selectedId]: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm focus:border-amber-400 focus:outline-none"
          />
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {selected.episodeArcs.map((arc, i) => (
              <li key={arc} className="rounded-md border border-white/10 px-3 py-2 text-sm">
                <span className="text-xs text-amber-300">第 {i + 1} 集 · 45 秒</span>
                <br />
                {arc}
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function OptionGrid({
  options,
  value,
  onChange,
  name,
}: {
  options: { id: string; label: string; description: string }[];
  value: string;
  onChange: (id: string) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" className="grid gap-2 md:grid-cols-2">
      {options.map((o) => (
        <label
          key={o.id}
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
            value === o.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 hover:border-white/30"
          }`}
        >
          <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-1 accent-amber-400" />
          <span>
            <span className="text-white">{o.label}</span>
            <span className="block text-xs text-neutral-400">{o.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
