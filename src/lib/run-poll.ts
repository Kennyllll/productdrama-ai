// 生成任务轮询和进度估算（纯函数，前后端共用）
import type { JobKind } from "@/lib/shorts";

export interface RunLite {
  kind: JobKind;
  startedAt: number;
  step: "prep" | "gen";
  jobId?: string;
  error?: string;
}

/** 轻量轮询结果：只有运行中的任务 + 两个「变了没」的时间戳 */
export interface RunPulse {
  running: Record<string, RunLite>;
  videoAt: string;
  jobsAt: string;
  /** 各种任务最近通常要多少秒（没有历史就没有这个键） */
  typical: Partial<Record<JobKind, number>>;
}

/** 戳一样 = 什么都没变，不用再取整条视频 */
export function pulseKey(p: RunPulse): string {
  const runs = Object.entries(p.running)
    .map(([id, r]) => `${id}:${r.kind}:${r.step}:${r.jobId ?? ""}:${r.error ? 1 : 0}`)
    .sort()
    .join(",");
  return `${p.videoAt}|${p.jobsAt}|${runs}`;
}

/** 刚开始 2 秒一次，3 分钟内 4 秒一次，之后 8 秒一次；页面在后台时不轮询（null） */
export function pollDelay(sinceStartMs: number, hidden: boolean): number | null {
  if (hidden) return null;
  if (sinceStartMs < 30_000) return 2_000;
  if (sinceStartMs < 180_000) return 4_000;
  return 8_000;
}

export function median(xs: number[]): number | undefined {
  const s = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 没有历史时的默认用时（秒）：准备 = 渲染/上传参考图，生成 = 等供应商 */
export const PREP_SEC: Record<JobKind, number> = { frame: 90, video: 20, scene: 30 };
export const GEN_SEC: Record<JobKind, number> = { frame: 90, video: 330, scene: 90 };

export interface RunEstimate {
  /** 0–95：估算进度，没完成前最多到 95 */
  pct: number;
  remainingSec: number;
  /** 已经比平时久 */
  slow: boolean;
}

export function estimateRun(o: { kind: JobKind; step: "prep" | "gen"; startedAt: number; now: number; jobCreatedAt?: number; typicalSec?: number }): RunEstimate {
  const prepT = PREP_SEC[o.kind];
  const genT = o.typicalSec && o.typicalSec > 0 ? o.typicalSec : GEN_SEC[o.kind];
  const el = Math.max(0, (o.now - o.startedAt) / 1000);
  let done: number;
  let total: number;
  let remaining: number;
  if (o.step === "prep" || o.jobCreatedAt === undefined) {
    const prepEl = o.step === "prep" ? el : Math.min(el, prepT);
    const genEl = o.step === "prep" ? 0 : el - prepEl;
    done = prepEl + genEl;
    total = prepT + genT;
    remaining = Math.max(0, prepT - prepEl) + genT - genEl;
  } else {
    const prepDone = Math.max(0, (o.jobCreatedAt - o.startedAt) / 1000);
    const genEl = Math.max(0, (o.now - o.jobCreatedAt) / 1000);
    done = prepDone + genEl;
    total = prepDone + genT;
    remaining = genT - genEl;
  }
  return {
    pct: Math.round(Math.min(95, Math.max(2, (done / total) * 100))),
    remainingSec: Math.max(0, Math.round(remaining)),
    slow: remaining < 0,
  };
}

export function fmtRemaining(e: RunEstimate): string {
  if (e.slow) return "比平时慢一些，还在等，不会重复扣费";
  if (e.remainingSec < 60) return "预计不到 1 分钟";
  return `预计还要约 ${Math.ceil(e.remainingSec / 60)} 分钟`;
}
