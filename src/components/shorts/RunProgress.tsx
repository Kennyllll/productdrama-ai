"use client";

import { estimateRun, fmtRemaining } from "@/lib/run-poll";
import type { JobKind } from "@/lib/shorts";

/** 生成中的进度条 + 预计剩余时间（按这台电脑最近几次的实际用时估算） */
export function RunProgress({ kind, step, startedAt, jobCreatedAt, typicalSec, now }: { kind: JobKind; step: "prep" | "gen"; startedAt: number; jobCreatedAt?: string; typicalSec?: number; now: number }) {
  const e = estimateRun({ kind, step, startedAt, now, typicalSec, jobCreatedAt: jobCreatedAt ? Date.parse(jobCreatedAt) : undefined });
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sky-950" role="progressbar" aria-valuenow={e.pct} aria-valuemin={0} aria-valuemax={100} aria-label="估算进度">
        <div className={`h-full rounded-full transition-[width] duration-1000 ${e.slow ? "bg-amber-300" : "bg-sky-300"}`} style={{ width: `${e.pct}%` }} />
      </div>
      <p className={`mt-1 text-xs ${e.slow ? "text-amber-200" : "text-sky-100"}`}>
        {fmtRemaining(e)}
        {typicalSec ? `（最近通常 ${Math.max(1, Math.round(typicalSec / 60))} 分钟）` : ""}
      </p>
    </div>
  );
}
