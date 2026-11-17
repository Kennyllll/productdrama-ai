"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { applyShotTextAction, rewriteShotAction, shotSyncAction } from "@/app/short-actions";
import { TEXT_FIELDS, TEXT_LABELS, type ShotSync, type TextField } from "@/lib/shorts-sync";
import { DraftFeedback } from "@/components/shorts/DraftFeedback";

type State = { sync: ShotSync; draft: boolean; texts: Record<TextField, string> };
type Proposal = { fields: Record<TextField, string>; notes: string[]; left: string[]; needs3d: string[] };

/** 场地地图页：这一镜的文字和 3D 是否一致 + 按 3D 改写（改了 3D 会自动刷新） */
export function ShotSyncBox({ videoId, shotId, label }: { videoId: string; shotId: string; label: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [prop, setProp] = useState<Proposal | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const load = useCallback(() => {
    void shotSyncAction(videoId, shotId).then((r) => r.result && setSt(r.result));
  }, [videoId, shotId]);
  useEffect(() => {
    setProp(null);
    setMsg("");
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  if (!st) return null;
  const { sync, draft, texts } = st;
  const n = sync.changes.length + sync.issues.length;
  const btn = "rounded border border-white/15 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-40";
  const rewrite = (feedback = "", draftFields?: Record<TextField, string>) =>
    start(async () => {
      setMsg("");
      const r = await rewriteShotAction(videoId, shotId, { feedback, draft: draftFields });
      if (r.error) setMsg(`⚠ ${r.error}`);
      else if (r.result) setProp(r.result);
    });
  const apply = (p: Proposal) =>
    start(async () => {
      const r = await applyShotTextAction(videoId, shotId, p.fields);
      if (r.error) setMsg(`⚠ ${r.error}`);
      else {
        setProp(null);
        setMsg("已按 3D 改写并保存");
        load();
      }
    });
  return (
    <div className={`space-y-2 rounded-lg border p-3 text-xs ${n ? "border-amber-400/40 bg-amber-400/5 text-amber-200" : "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"}`}>
      <p className="text-sm font-medium">
        {label} 文字检查（免费）：{n ? `${n} 处要看` : sync.tracked ? "文字和 3D 一致" : "没发现冲突（保存一次分镜后开始跟踪 3D 改动）"}
      </p>
      {sync.changes.length ? (
        <div>
          <p>文字写好后 3D 改过，文字可能过期：</p>
          <ul className="list-disc pl-4">
            {sync.changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {sync.issues.length ? (
        <div>
          <p>文字和 3D 对不上：</p>
          <ul className="list-disc pl-4">
            {sync.issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!prop && (n || draft) ? (
        <button className={btn} disabled={busy || !draft} onClick={() => rewrite()}>
          {busy ? "改写中…" : "按 3D 改写这一镜（DeepSeek，每次不到 $0.01）"}
        </button>
      ) : null}
      {n && !draft ? <p>构图已确认：要改文字先在工作台点“退回构图”。</p> : null}
      {msg ? <p className="text-neutral-300">{msg}</p> : null}
      {prop ? (
        <div className="space-y-2 rounded border border-sky-400/40 bg-sky-400/5 p-2 text-neutral-300">
          <p className="text-sm font-medium text-sky-200">按 3D 改写的草稿（还没保存）</p>
          {prop.notes.length ? (
            <ul className="list-disc pl-4 text-sky-100">
              {prop.notes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : null}
          {TEXT_FIELDS.filter((k) => prop.fields[k] !== texts[k]).map((k) => (
            <div key={k} className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="text-neutral-500">{TEXT_LABELS[k]} · 改前</p>
                <p className="whitespace-pre-wrap rounded bg-red-500/10 p-2 text-red-100/80">{texts[k]}</p>
              </div>
              <div>
                <p className="text-neutral-500">{TEXT_LABELS[k]} · 改后</p>
                <p className="whitespace-pre-wrap rounded bg-emerald-500/10 p-2 text-emerald-100">{prop.fields[k]}</p>
              </div>
            </div>
          ))}
          {TEXT_FIELDS.every((k) => prop.fields[k] === texts[k]) ? <p>AI 认为文字不用改。</p> : null}
          {prop.left.length ? <p className="text-amber-300">改完还剩：{prop.left.join("；")}</p> : null}
          <DraftFeedback busy={busy} needs3d={prop.needs3d} onSubmit={(f) => rewrite(f, prop.fields)} />
          <div className="flex gap-2">
            <button className={`${btn} border-amber-400/60 text-amber-200`} disabled={busy} onClick={() => apply(prop)}>
              采用并保存
            </button>
            <button className={btn} disabled={busy} onClick={() => setProp(null)}>
              不用，保持原文
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
