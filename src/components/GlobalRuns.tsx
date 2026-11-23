"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { activeRunsAction, type ActiveRun } from "@/app/run-actions";

const KIND: Record<string, string> = { frame: "首帧", video: "视频", scene: "场地参考图" };
type Done = ActiveRun & { ok: boolean };

/**
 * 在任何页面都能看到后台生成：有任务时右下角显示「n 个在生成」，完成或失败时弹一条，点了去那条视频。
 * 每次只取几十字节；页面在后台时不查；没任务时 30 秒查一次，有任务时 8 秒。
 */
export function GlobalRuns() {
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveRun[]>([]);
  const [done, setDone] = useState<Done[]>([]);
  const prev = useRef<Map<string, ActiveRun>>(new Map());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      timer = undefined;
      if (document.hidden) return;
      const ended = [...prev.current.values()].filter((r) => r.jobId);
      const res = await activeRunsAction(ended.map((r) => r.jobId!)).catch(() => null);
      if (!alive) return;
      if (res) {
        const now = new Map(res.runs.map((r) => [r.key, r]));
        const fin: Done[] = [];
        for (const [k, r] of prev.current) {
          if (now.has(k) || !r.jobId) continue;
          const st = res.ended[r.jobId];
          if (st) fin.push({ ...r, ok: st === "completed" });
        }
        prev.current = now;
        setActive(res.runs);
        if (fin.length) setDone((d) => [...fin, ...d].slice(0, 3));
      }
      timer = setTimeout(tick, prev.current.size ? 8_000 : 30_000);
    };
    const vis = () => {
      if (!document.hidden && !timer) void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const here = (r: ActiveRun) => pathname.startsWith(`/projects/${r.projectId}/shorts/${r.videoId}`);
  const elsewhere = active.filter((r) => !here(r) && !r.error);
  const notes = done.filter((r) => !here(r));
  if (!elsewhere.length && !notes.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex w-72 flex-col gap-2 text-sm" aria-live="polite">
      {notes.map((r) => (
        <div key={`${r.key}-${r.jobId}`} className={`rounded-lg border px-3 py-2 shadow-lg ${r.ok ? "border-emerald-700 bg-emerald-950" : "border-red-800 bg-red-950"}`}>
          <p className="text-neutral-100">
            {r.title} · {r.label}的{KIND[r.kind] ?? "任务"}
            {r.ok ? "生成好了" : "没生成成功，失败不收费"}
          </p>
          <div className="mt-1 flex gap-3 text-xs">
            <Link className="text-amber-300 underline" href={`/projects/${r.projectId}/shorts/${r.videoId}`} onClick={() => setDone((d) => d.filter((x) => x !== r))}>
              去看看
            </Link>
            <button type="button" className="text-neutral-400" onClick={() => setDone((d) => d.filter((x) => x !== r))}>
              知道了
            </button>
          </div>
        </div>
      ))}
      {elsewhere.length > 0 && (
        <Link href={`/projects/${elsewhere[0].projectId}/shorts/${elsewhere[0].videoId}`} className="rounded-lg border border-sky-800 bg-sky-950/90 px-3 py-2 text-sky-100 shadow-lg">
          {elsewhere.length} 个在后台生成：{elsewhere.map((r) => `${r.label}${KIND[r.kind] ?? ""}`).join("、")}。可以先做别的，好了会提示
        </Link>
      )}
    </div>
  );
}
