import type { JobKind } from "@/lib/shorts";

/** 后台生成中的任务（按视频:镜头）；prep = 渲染 / 上传参考图，gen = 已提交供应商 */
export interface RunInfo {
  kind: JobKind;
  startedAt: number;
  step: "prep" | "gen";
  jobId?: string;
  error?: string;
}

const g = globalThis as unknown as { __pdRuns?: Map<string, RunInfo> };
export const runs: Map<string, RunInfo> = (g.__pdRuns ??= new Map());
export const runKey = (videoId: string, shotId: string) => `${videoId}:${shotId}`;

/** finished(jobId)：报错之后任务其实已完成（查进度时断网、后来接着等到了结果），旧报错自动清掉 */
export function runningOf(videoId: string, finished?: (jobId: string) => boolean): Record<string, RunInfo> {
  const out: Record<string, RunInfo> = {};
  for (const [k, r] of runs) {
    if (!k.startsWith(`${videoId}:`)) continue;
    if (r.error && r.jobId && finished?.(r.jobId)) {
      runs.delete(k);
      continue;
    }
    out[k.slice(videoId.length + 1)] = r;
  }
  return out;
}
