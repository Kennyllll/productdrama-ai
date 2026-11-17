"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { applyShotTextAction, fitShotActionsAction, rewriteShotAction, shotSyncAction } from "@/app/short-actions";
import { type ShotSync, type TextField } from "@/lib/shorts-sync";
import { DraftView, SyncNotice } from "@/components/shorts/RewriteUI";

type State = { sync: ShotSync; draft: boolean; texts: Record<TextField, string> };
type Proposal = { fields: Record<TextField, string>; notes: string[]; left: string[]; needs3d: string[] };

/** 场地地图页：这一镜的文字和 3D 是否一致 + 按 3D 改写（改了 3D 会自动刷新） */
export function ShotSyncBox({ videoId, shotId, label, figIds = [] }: { videoId: string; shotId: string; label: string; figIds?: string[] }) {
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
  const n = sync.changes.length + sync.issues.length + (sync.fix3d?.length ?? 0);
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
    <div className="space-y-2 text-xs">
      {n ? (
        <SyncNotice onFix3d={() => start(async () => { const r = await fitShotActionsAction(videoId, shotId); if (r.error) setMsg(`⚠ ${r.error}`); else { setMsg("已把 3D 做不到的动作改好"); load(); } })} figHref={(id) => `?shot=${shotId}${id ? `&fig=${id}` : ""}`} sync={sync} busy={busy} working={busy && !prop} canRewrite={draft} why={draft ? "" : "构图已确认：要改文字先在工作台点“退回构图”"} msg={msg} onRewrite={() => rewrite()} />
      ) : (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-emerald-200">
          {label} 文字检查（免费）：文字和 3D 没有冲突
        </p>
      )}
      {!n && msg ? <p className="text-neutral-300">{msg}</p> : null}
      {prop ? (
        <DraftView p={prop} old={texts} busy={busy} figIds={figIds} figHref={(id) => `?shot=${shotId}${id ? `&fig=${id}` : ""}`} onUse={() => apply(prop)} onDrop={() => setProp(null)} onFeedback={(f) => rewrite(f, prop.fields)} />
      ) : null}
    </div>
  );
}
