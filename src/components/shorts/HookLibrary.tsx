"use client";

import { useState, useTransition } from "react";
import { deleteHookAction, saveHookAction } from "@/app/hook-actions";
import { HOOK_ENTRIES, type HookData, type HookDef, type HookEntry, type HookField } from "@/lib/hooks";

const inp = "w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-sm text-white";
const blank = (): HookData => ({ name: "", about: "", use: "", seconds: 3, entry: "assembled", caption: "", fields: [] });

function HookCard({ h, onDone }: { h: HookDef | null; onDone?: () => void }) {
  const [d, setD] = useState<HookData>(h ? { name: h.name, about: h.about, use: h.use, seconds: h.seconds, entry: h.entry, caption: h.caption, fields: h.fields } : blank());
  const [open, setOpen] = useState(!h);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const set = (p: Partial<HookData>) => {
    setD((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const setF = (i: number, p: Partial<HookField>) => set({ fields: d.fields.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  const save = () =>
    start(async () => {
      const r = await saveHookAction(h?.id ?? null, d);
      setMsg(r.error ? `⚠ ${r.error}` : "已保存");
      if (!r.error) {
        setDirty(false);
        onDone?.();
      }
    });
  const del = () => {
    if (!h || !window.confirm(`删除「${h.name}」？已经用它做的开头不受影响。`)) return;
    start(async () => {
      const r = await deleteHookAction(h.id);
      if (r.error) setMsg(`⚠ ${r.error}`);
    });
  };
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900 p-3">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span className="text-sm font-medium text-white">{d.name || "新 Hook"}</span>
        <span className="text-xs text-neutral-500">
          {d.seconds} 秒 · {HOOK_ENTRIES.find((e) => e.id === d.entry)?.label} · {d.fields.length} 个属性 {open ? "▲" : "▼"}
        </span>
      </button>
      {!open ? <p className="mt-1 text-xs text-neutral-400">{d.use}</p> : null}
      {open ? (
        <div className="mt-3 space-y-2 text-xs text-neutral-400">
          <div className="grid gap-2 md:grid-cols-4">
            <label className="block md:col-span-2">
              名字
              <input className={inp} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="block">
              默认秒数
              <input className={inp} type="number" min={1} max={4} step={0.5} value={d.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} />
            </label>
            <label className="block">
              产品怎么出场
              <select className={inp} value={d.entry} onChange={(e) => set({ entry: e.target.value as HookEntry })}>
                {HOOK_ENTRIES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            说明（怎么拍、为什么有效，AI 写剧本时照这个）
            <textarea className={inp} rows={2} value={d.about} onChange={(e) => set({ about: e.target.value })} />
          </label>
          <label className="block">
            什么时候用
            <input className={inp} value={d.use} onChange={(e) => set({ use: e.target.value })} />
          </label>
          <label className="block">
            字幕模板（{"{属性代号}"} 换成视频里填的值，{"{product}"} 换成产品名）
            <input className={inp} value={d.caption} onChange={(e) => set({ caption: e.target.value })} />
          </label>
          <div className="space-y-1">
            <p>专属属性（示例值只是提示，实际值在每条视频里填）</p>
            {d.fields.map((f, i) => (
              <div key={i} className="grid items-center gap-2 md:grid-cols-[7rem_10rem_1fr_auto_auto]">
                <input className={inp} value={f.key} placeholder="代号，如 price" onChange={(e) => setF(i, { key: e.target.value })} />
                <input className={inp} value={f.label} placeholder="名字，如 现价" onChange={(e) => setF(i, { label: e.target.value })} />
                <input className={inp} value={f.example} placeholder="示例值" onChange={(e) => setF(i, { example: e.target.value })} />
                <label className="flex items-center gap-1 whitespace-nowrap" title="勾上 = 改了这项，已经做好的画面要重做；不勾 = 只改字幕，免费">
                  <input type="checkbox" checked={f.visual} onChange={(e) => setF(i, { visual: e.target.checked })} />
                  影响画面
                </label>
                <button className="text-rose-300" onClick={() => set({ fields: d.fields.filter((_, k) => k !== i) })}>
                  删
                </button>
              </div>
            ))}
            <button className="rounded border border-white/10 px-2 py-1 text-neutral-200" onClick={() => set({ fields: [...d.fields, { key: "", label: "", example: "", visual: false }] })}>
              ＋ 属性
            </button>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button className="rounded bg-amber-400 px-3 py-1 text-sm font-medium text-black disabled:opacity-50" disabled={pending || !dirty} onClick={save}>
              {h ? "保存" : "新建"}
            </button>
            {h ? (
              <button className="text-rose-300" disabled={pending} onClick={del}>
                删除这个 Hook
              </button>
            ) : null}
            <span>{msg}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HookLibrary({ hooks }: { hooks: HookDef[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {hooks.map((h) => (
        <HookCard key={`${h.id}:${h.updatedAt}`} h={h} />
      ))}
      {adding ? (
        <HookCard h={null} onDone={() => setAdding(false)} />
      ) : (
        <button className="rounded border border-white/10 px-3 py-1 text-sm text-neutral-200" onClick={() => setAdding(true)}>
          ＋ 新建 Hook
        </button>
      )}
    </div>
  );
}
