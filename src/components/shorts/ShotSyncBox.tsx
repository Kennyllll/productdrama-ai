"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { SetLayout } from "@/lib/production-repo";
import { figuresOf, KB002_RIG, type ProductRig } from "@/lib/figures";
import type { CastOption } from "@/lib/families";
import type { ShortShot } from "@/lib/shorts";
import { promptConflicts } from "@/lib/shorts-conflicts";
import { basisOf, shotChecks, stripFilmer } from "@/lib/shorts-sync";
import { castTextIssues, stageRuleIssues, stageTextNotes, type StagePose } from "@/lib/stage-rules";
import { applyShotTextAction, fitShotActionsAction, rewriteShotAction, shotSyncAction } from "@/app/short-actions";
import { type ShotSync, type TextField } from "@/lib/shorts-sync";
import { DraftView, SyncNotice } from "@/components/shorts/RewriteUI";

type State = { sync: ShotSync; draft: boolean; texts: Record<TextField, string> };
type Proposal = { fields: Record<TextField, string>; notes: string[]; left: string[]; needs3d: string[] };

/** 场地地图页：这一镜的文字和 3D 是否一致 + 按 3D 改写（改了 3D 会自动刷新） */
export function ShotSyncBox({
  videoId,
  shotId,
  label,
  figIds = [],
  layout,
  saved = true,
  live,
  members = [],
  rig,
  filmerId,
}: {
  /** 这一镜谁拿手机（家庭成员 id） */
  filmerId?: string;
  videoId: string;
  shotId: string;
  label: string;
  figIds?: string[];
  /** 3D 页里这一镜的摆位（保存过的，没保存过 = 自动摆位） */
  layout?: SetLayout;
  /** 这一镜在 3D 里保存过没有 */
  saved?: boolean;
  /** 编辑器里还没保存的摆法：有它就按它在浏览器里查（免费） */
  live?: StagePose | null;
  members?: CastOption[];
  rig?: ProductRig | null;
}) {
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
  const texts0 = st?.texts;
  const now = useMemo(() => {
    if (!layout || !texts0) return null;
    const l: SetLayout = live ? { ...layout, figures: live.figures, bike: live.bike, bikeYaw: live.bikeYaw, bikeLift: live.bikeLift, bikePitch: live.bikePitch, bikeRoll: live.bikeRoll, bikeGround: live.bikeGround } : layout;
    const d: StagePose = { figures: figuresOf(l), bike: l.bike, bikeYaw: l.bikeYaw ?? 0, bikeLift: l.bikeLift ?? 0, bikePitch: l.bikePitch ?? 0, bikeRoll: l.bikeRoll ?? 0, bikeGround: l.bikeGround ?? 0 };
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changed = !!live && !(same(live.figures, figuresOf(layout)) && same(live.bike, layout.bike) && same(live.bikeYaw, layout.bikeYaw ?? 0) && same(live.bikeLift, layout.bikeLift ?? 0) && same(live.bikePitch, layout.bikePitch ?? 0) && same(live.bikeRoll, layout.bikeRoll ?? 0));
    const text = Object.values(texts0).join("\n");
    const s = { ...texts0, layout: l } as unknown as ShortShot;
    const full = [...shotChecks(s, basisOf(s, null)), ...promptConflicts(s, rig ?? KB002_RIG).map((c) => c.msg)];
    const extra = [...stageRuleIssues(d, members, filmerId), ...castTextIssues(stripFilmer(text), members, d.figures)];
    return { moved: changed, stale: changed || !saved, figs: d.figures.length, full: [...new Set([...full, ...extra])], extra, notes: stageTextNotes(text, d) };
  }, [layout, texts0, live, saved, members, rig, filmerId]);
  if (!st) return null;
  const { sync, draft, texts } = st;
  const liveBox = now ? (
    <div className={`space-y-1 rounded-lg border p-3 ${now.stale && now.full.length ? "border-amber-400/40 bg-amber-400/5 text-amber-100" : "border-white/10 bg-neutral-900/60 text-neutral-300"}`}>
      {now.stale ? (
        <p className="font-medium">{now.moved ? `按你现在的摆法检查（还没保存，3D 里 ${now.figs} 个人）` : `这一镜还没在 3D 里摆过：按自动摆位查（3D 里 ${now.figs} 个人）`}</p>
      ) : null}
      {(now.stale ? now.full : now.extra).map((t) => (
        <p key={t}>· {t}</p>
      ))}
      {now.stale && !now.full.length ? <p className="text-emerald-200">文字和现在的 3D 没有冲突</p> : null}
      {now.notes.length ? (
        <div className="space-y-0.5 pt-1 text-sky-200">
          <p className="text-neutral-400">3D 做不到的，先说清楚：</p>
          {now.notes.map((x) => (
            <p key={x.key}>· {x.text}</p>
          ))}
        </div>
      ) : null}
      {!saved ? <p className="text-neutral-400">摆好以后点上方「保存」：人数不对就点「+ 小孩」「+ 大人」。</p> : null}
    </div>
  ) : null;
  const showLive = !!now && (now.stale || now.extra.length > 0 || now.notes.length > 0);
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
      {showLive ? liveBox : null}
      {now?.stale ? null : n ? (
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
