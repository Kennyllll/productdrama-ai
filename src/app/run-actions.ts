"use server";

import { getJob, recentJobSeconds, videoStamp } from "@/lib/shorts-repo";
import { runningOf } from "@/lib/shorts-runs";
import { median, type RunPulse } from "@/lib/run-poll";
import type { JobKind } from "@/lib/shorts";

/** 生成中轮询用：几百字节，代替每次取整条视频（20–30 KB）。有变化前端再取完整状态 */
export async function runPulseAction(videoId: string): Promise<RunPulse | null> {
  const s = videoStamp(videoId);
  if (!s) return null;
  const typical: Partial<Record<JobKind, number>> = {};
  for (const [k, xs] of Object.entries(recentJobSeconds())) {
    const m = median(xs ?? []);
    if (m) typical[k as JobKind] = Math.round(m);
  }
  return { running: runningOf(videoId, (id) => getJob(id)?.status === "completed"), ...s, typical };
}
