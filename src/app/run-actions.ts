"use server";

import { getJob, getShortVideo, recentJobSeconds, videoStamp } from "@/lib/shorts-repo";
import { runningOf, runs } from "@/lib/shorts-runs";
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

export interface ActiveRun {
  key: string;
  videoId: string;
  projectId: string;
  title: string;
  label: string;
  kind: JobKind;
  jobId?: string;
  error?: string;
}

/** 全局右下角提示用：所有在跑的任务 + 刚结束的任务状态（ended 传上次看到的任务号） */
export async function activeRunsAction(ended: string[] = []): Promise<{ runs: ActiveRun[]; ended: Record<string, string> }> {
  const out: ActiveRun[] = [];
  const vids = new Map<string, ReturnType<typeof getShortVideo>>();
  for (const [key, r] of runs) {
    const i = key.indexOf(":");
    const videoId = key.slice(0, i);
    const shotId = key.slice(i + 1);
    if (!vids.has(videoId)) vids.set(videoId, getShortVideo(videoId));
    const v = vids.get(videoId);
    if (!v) continue;
    const n = v.shots.findIndex((s) => s.id === shotId);
    out.push({ key, videoId, projectId: v.projectId, title: v.title, label: n >= 0 ? `#${n + 1}` : "镜头", kind: r.kind, jobId: r.jobId, error: r.error });
  }
  const st: Record<string, string> = {};
  for (const id of ended.slice(0, 20)) {
    const j = getJob(id);
    if (j && (j.status === "completed" || j.status === "failed")) st[id] = j.status;
  }
  return { runs: out, ended: st };
}
