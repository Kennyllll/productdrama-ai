"use client";

import { useState } from "react";
import { TEXT_FIELDS, TEXT_LABELS, type ShotSync, type TextField } from "@/lib/shorts-sync";

const btn = "rounded border border-white/15 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-40";
const primary = "rounded bg-amber-400 px-3 py-1 text-xs font-medium text-black disabled:opacity-40";

/** 文字和 3D 不一致：只给一句话和一个按钮，具体哪几处收起来 */
export function SyncNotice({ sync, busy, working, canRewrite, why, msg, onRewrite }: { sync: ShotSync; busy: boolean; working: boolean; canRewrite: boolean; why?: string; msg?: string; onRewrite: () => void }) {
  const list = [...sync.issues, ...sync.changes];
  if (!list.length) return null;
  return (
    <div className="mt-1 space-y-2 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-xs text-amber-200">
      <p className="font-medium">这一镜的文字和 3D 摆位有 {list.length} 处不一致，生成前要改好。</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={primary} disabled={busy || !canRewrite} onClick={onRewrite}>
          {working ? "AI 改写中…" : "让 AI 按 3D 改文字（约 $0.01）"}
        </button>
        {why ? <span className="text-neutral-400">{why}</span> : null}
      </div>
      {msg ? <p className="text-neutral-200">{msg}</p> : null}
      <details>
        <summary className="cursor-pointer text-neutral-400">看是哪 {list.length} 处</summary>
        <ul className="mt-1 list-disc pl-4">
          {list.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type Proposal = { fields: Record<TextField, string>; notes: string[]; left: string[]; needs3d: string[] };

/** AI 改写完：只摊开「画面」，其他收起来；固定三个按钮；要去 3D 补的直接给链接 */
export function DraftView({ p, old, busy, useDisabled, figIds, figHref, onUse, onDrop, onFeedback }: {
  p: Proposal;
  old: Record<TextField, string>;
  busy: boolean;
  useDisabled?: boolean;
  figIds: string[];
  figHref: (figId: string) => string;
  onUse: () => void;
  onDrop: () => void;
  onFeedback: (feedback: string) => void;
}) {
  const [fb, setFb] = useState<string | null>(null);
  const changed = TEXT_FIELDS.filter((k) => p.fields[k] !== old[k]);
  const other = changed.filter((k) => k !== "description");
  const pair = (k: TextField) => (
    <div key={k} className="grid gap-2 md:grid-cols-2">
      <div>
        <p className="text-neutral-500">{TEXT_LABELS[k]} · 原来</p>
        <p className="whitespace-pre-wrap rounded bg-white/5 p-2 text-neutral-400">{old[k] || "（空）"}</p>
      </div>
      <div>
        <p className="text-neutral-500">{TEXT_LABELS[k]} · AI 改成</p>
        <p className="whitespace-pre-wrap rounded bg-emerald-500/10 p-2 text-emerald-100">{p.fields[k]}</p>
      </div>
    </div>
  );
  const figLink = (x: string) => {
    const m = /人偶\s*(\d+)/.exec(x);
    return figHref(m ? (figIds[Number(m[1]) - 1] ?? "") : "");
  };
  return (
    <div className="space-y-3 rounded-lg border border-sky-400/40 bg-sky-400/5 p-3 text-xs text-neutral-300">
      <p className="text-sm font-medium text-sky-200">{changed.length ? "AI 按 3D 改好了文字（还没保存）" : "AI 觉得文字不用改"}</p>
      {changed.includes("description") ? pair("description") : null}
      {p.left.length ? (
        <div className="rounded border border-rose-400/50 bg-rose-500/10 p-2 text-rose-100">
          <p className="font-medium">改完还有 {p.left.length} 处和 3D 对不上，建议先别用，点「告诉 AI 哪里不对」：</p>
          <ul className="list-disc pl-4">
            {p.left.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.needs3d.length ? (
        <div className="space-y-1 rounded border border-amber-400/40 bg-amber-400/5 p-2 text-amber-200">
          <p className="font-medium">这些文字改不了，要你在 3D 里补：</p>
          {p.needs3d.map((x) => (
            <div key={x} className="flex items-center justify-between gap-2">
              <span>{x}</span>
              <a href={figLink(x)} className={`${btn} shrink-0`}>
                去 3D 改
              </a>
            </div>
          ))}
        </div>
      ) : null}
      {other.length || p.notes.length ? (
        <details>
          <summary className="cursor-pointer text-neutral-400">其他改动（{other.length} 项）和 AI 的说明</summary>
          <div className="mt-2 space-y-2">
            {p.notes.length ? (
              <ul className="list-disc pl-4 text-sky-100">
                {p.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {other.map(pair)}
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy || useDisabled || !changed.length} onClick={onUse}>
          {p.left.length ? "仍然用这个" : "用这个"}
        </button>
        <button className={btn} disabled={busy} onClick={onDrop}>
          不要
        </button>
        <button className={btn} disabled={busy} onClick={() => setFb(fb === null ? "" : null)}>
          告诉 AI 哪里不对
        </button>
      </div>
      {fb !== null ? (
        <div className="space-y-1">
          <textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="大白话就行，比如：小孩面朝镜头，双脚踩在脚踏上" className="w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-neutral-100" />
          <button className={btn} disabled={busy || fb.trim().length < 2} onClick={() => onFeedback(fb.trim())}>
            {busy ? "AI 重写中…" : "按这句话重写（约 $0.01）"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
