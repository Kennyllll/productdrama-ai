// 钱和快照的纯计算：哪一镜花了多少、删掉/替换会丢多少、导出用了哪一版（不碰数据库，方便测试）
import { bodyOf, hookParts, jobCost, type GenJob, type ShortShot, type ShortVideoData } from "@/lib/shorts";

type Job = Pick<GenJob, "id" | "shotId" | "kind" | "status" | "actualUsd" | "estUsd" | "isTest" | "model">;

const round = (n: number) => Math.round(n * 100) / 100;
export const usdText = (n: number) => `$${n.toFixed(2)}`;
const cost = (j: Job) => (j.isTest ? 0 : jobCost(j as GenJob));

/** 一个任务花了多少（失败 = 0，测试 = 0） */
export const jobUsd = (jobs: Job[], id: string | null | undefined) => {
  const j = id ? jobs.find((x) => x.id === id) : undefined;
  return j ? cost(j) : 0;
};

/** 一镜（或几镜）一共花了多少：首帧 + 视频 + 返工的都算 */
export const shotsSpend = (jobs: Job[], shotIds: string[]) => round(jobs.filter((j) => shotIds.includes(j.shotId)).reduce((s, j) => s + cost(j), 0));

/** 镜头卡上当前挂着的首帧 / 视频值多少钱（替换时会丢掉的） */
export function currentMediaUsd(jobs: Job[], s: Pick<ShortShot, "frameJobId" | "videoJobId">): { frame: number; video: number } {
  return { frame: round(jobUsd(jobs, s.frameJobId)), video: round(jobUsd(jobs, s.videoJobId)) };
}

/** 生成一次新的首帧 / 视频会替换掉哪个旧结果、值多少 */
export function replaceLoss(jobs: Job[], s: Pick<ShortShot, "frameJobId" | "videoJobId">, kind: string): number {
  if (kind === "frame") return round(jobUsd(jobs, s.frameJobId));
  if (kind === "video") return round(jobUsd(jobs, s.videoJobId));
  return 0;
}

export interface SnapshotShot {
  n: number;
  id: string;
  label: string;
  isHook: boolean;
  frameJobId: string | null;
  videoJobId: string | null;
  frameModel: string;
  videoModel: string;
  useSeconds: number;
  trimStart: number;
  caption: string;
  usd: number;
}

export interface ExportSnapshot {
  hook: { id: string; name: string; libId?: string; libName?: string; effect?: string; caption: string } | null;
  shots: SnapshotShot[];
  captions: boolean;
  seconds: number;
  resolution: string;
  /** 这一版用到的首帧 + 视频的钱（实际价优先，没有就用审批时的估价） */
  mediaUsd: number;
  /** 这条视频到导出时一共花了多少（含返工、丢弃的） */
  videoSpentUsd: number;
  priceBasis: string;
}

/** 正式导出前：没采用 / 没视频的正文镜头列出来，不能静默跳过 */
export function missingBody(v: Pick<ShortVideoData, "shots">): string[] {
  return v.shots.flatMap((s, i) => (!s.hook && (s.stage !== "accepted" || !s.videoJobId) ? [`#${i + 1}${s.beat ? ` ${s.beat}` : ""}`] : []));
}

export function buildSnapshot(v: Pick<ShortVideoData, "shots" | "captions" | "resolution">, hook: ShortShot | null, jobs: Job[]): ExportSnapshot {
  const parts = hook ? hookParts(v, hook) : [];
  const list = [...parts, ...bodyOf(v)].filter((s) => s.stage === "accepted" && s.videoJobId);
  const model = (id: string | null) => (id ? (jobs.find((j) => j.id === id)?.model ?? "") : "");
  const shots = list.map((s, i) => ({
    n: i + 1,
    id: s.id,
    label: s.hook ? `开头「${hook?.hook?.name ?? s.hook.name}」${s.hook.partOf ? "第二段" : ""}` : `#${v.shots.indexOf(s) + 1} ${s.beat}`.trim(),
    isHook: !!s.hook,
    frameJobId: s.frameJobId,
    videoJobId: s.videoJobId,
    frameModel: model(s.frameJobId),
    videoModel: model(s.videoJobId),
    useSeconds: s.useSeconds,
    trimStart: s.trimStart,
    caption: s.caption,
    usd: round(jobUsd(jobs, s.frameJobId) + jobUsd(jobs, s.videoJobId)),
  }));
  const used = new Set(list.flatMap((s) => [s.frameJobId, s.videoJobId]).filter(Boolean) as string[]);
  const estOnly = jobs.some((j) => used.has(j.id) && j.actualUsd == null);
  return {
    hook: hook?.hook ? { id: hook.id, name: hook.hook.name, libId: hook.hook.libId, libName: hook.hook.libName, effect: hook.hook.effect, caption: hook.caption } : null,
    shots,
    captions: v.captions !== false,
    seconds: round(shots.reduce((a, s) => a + s.useSeconds, 0)),
    resolution: v.resolution,
    mediaUsd: round(shots.reduce((a, s) => a + s.usd, 0)),
    videoSpentUsd: round(jobs.reduce((a, j) => a + cost(j), 0)),
    priceBasis: estOnly ? "部分是审批时的估价（供应商没回实际价）" : "供应商回的实际价",
  };
}
