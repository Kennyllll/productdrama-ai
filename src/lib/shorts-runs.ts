import type { JobKind } from "@/lib/shorts";

/** 后台生成中的任务（按视频:镜头）；prep = 渲染 / 上传参考图，gen = 已提交供应商 */
export interface RunInfo {
  kind: JobKind;
  startedAt: number;
  step: "prep" | "gen";
  jobId?: string;
  error?: string;
  /** 审批通过的金额：还没建任务（prep）时也算进预算，防止两个镜头同时审批用掉同一笔钱 */
  usd?: number;
}

const g = globalThis as unknown as { __pdRuns?: Map<string, RunInfo> };
export const runs: Map<string, RunInfo> = (g.__pdRuns ??= new Map());
export const runKey = (videoId: string, shotId: string) => `${videoId}:${shotId}`;

/** 已批准、还没建任务的钱（按镜头）：报价时当成"占用中"的任务算进已花 */
export function reservedOf(videoId: string): { shotId: string; kind: JobKind; usd: number }[] {
  const out: { shotId: string; kind: JobKind; usd: number }[] = [];
  for (const [k, r] of runs) {
    if (!k.startsWith(`${videoId}:`) || r.jobId || r.error || !r.usd) continue;
    out.push({ shotId: k.slice(videoId.length + 1), kind: r.kind, usd: r.usd });
  }
  return out;
}

/** 同一条视频的"报价 + 占用"排队做，两个请求不会同时读到同一笔余额 */
const locks: Map<string, Promise<unknown>> = ((globalThis as unknown as { __pdLocks?: Map<string, Promise<unknown>> }).__pdLocks ??= new Map());
export function withVideoLock<T>(videoId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(videoId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(videoId, next.catch(() => undefined));
  return next;
}

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
