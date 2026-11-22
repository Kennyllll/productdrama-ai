"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { studioStateAction, type StudioState } from "@/app/short-actions";
import { useRunPoll } from "@/lib/use-run-poll";

export const fmtWait = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** 场地地图 / 摆放界面右下角：后台生成进度，点了回工作台这一镜 */
export function JobPill({
  videoId,
  projectId,
}: {
  videoId: string;
  projectId: string;
}) {
  const [st, setSt] = useState<StudioState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState<{ shotId: string; label: string } | null>(
    null,
  );
  const prev = useRef<StudioState | null>(null);
  const loadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    const load = () =>
      void studioStateAction(videoId).then((next) => {
        if (!alive || !next) return;
        for (const [id, r] of Object.entries(prev.current?.running ?? {})) {
          if (r.error || next.running[id]) continue;
          if (next.jobs.find((j) => j.id === r.jobId)?.status === "completed")
            setDone({
              shotId: id,
              label: `#${next.video.shots.findIndex((s) => s.id === id) + 1} ${r.kind === "video" ? "视频" : "首帧"}`,
            });
        }
        prev.current = next;
        setSt(next);
      });
    loadRef.current = load;
    load();
    return () => {
      alive = false;
    };
  }, [videoId]);
  const runOn = Object.values(st?.running ?? {}).some((r) => !r.error);
  useRunPoll(videoId, runOn, () => loadRef.current());
  useEffect(() => {
    if (!runOn) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [runOn]);
  // 镜头已经删掉的任务不再显示（以前会显示成「#0」）
  const list = st ? Object.entries(st.running).filter(([id]) => st.video.shots.some((s) => s.id === id)) : [];
  if (!st || (!list.length && !done)) return null;
  const href = (id: string) =>
    `/projects/${projectId}/shorts/${videoId}?shot=${id}`;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {list.map(([id, r]) => {
        const label = `#${st.video.shots.findIndex((s) => s.id === id) + 1} ${r.kind === "video" ? "视频" : "首帧"}`;
        return (
          <Link
            key={id}
            href={href(id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg ${r.error ? "border-rose-400/60 bg-rose-950/90 text-rose-100" : "border-sky-400/60 bg-sky-950/90 text-sky-100"}`}
          >
            {r.error ? null : (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
            )}
            {r.error
              ? `${label}没生成成功 · 回工作台看原因`
              : `${label}生成中 · ${fmtWait(Math.max(0, Math.round((now - r.startedAt) / 1000)))}`}
          </Link>
        );
      })}
      {done ? (
        <div className="flex items-center gap-3 rounded-full border border-emerald-400/60 bg-emerald-950/90 px-4 py-2 text-sm text-emerald-100 shadow-lg">
          <Link href={href(done.shotId)}>{done.label}好了 · 回工作台检查</Link>
          <button onClick={() => setDone(null)} aria-label="关闭">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
