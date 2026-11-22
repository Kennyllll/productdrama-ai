// 短视频工作台的「管理与可追溯」接线：写操作日志、进回收站、超限放行、存成片版本。
// short-actions.ts 里只调这里的一行函数，方便和主线改动合并
import "server-only";
import { currentActor, type Actor } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { consumeApproval } from "@/lib/approvals-repo";
import { addExportVersion } from "@/lib/export-versions-repo";
import { addTrash } from "@/lib/trash-repo";
import { buildSnapshot, jobUsd, shotsSpend, usdText } from "@/lib/spend";
import type { JobKind, ShortShot, ShortVideo } from "@/lib/shorts";
import { listJobs, type JobRecord } from "@/lib/shorts-repo";

const KIND: Record<string, string> = { frame: "首帧", video: "视频", scene: "场地参考图" };
const STAGE: Record<string, string> = {
  confirm_comp: "确认构图",
  reopen_comp: "重新编辑构图",
  frame_ok: "首帧通过",
  frame_ok_force: "首帧通过（看图检查没过，人工放行）",
  frame_reject: "退回首帧",
  accept: "采用视频",
  rework: "退回返工",
};

/** 后台任务里拿不到请求（cookie），当作系统 */
async function actorSafe(): Promise<Actor | null> {
  try {
    return await currentActor();
  } catch {
    return null;
  }
}

export const shotLabel = (v: ShortVideo, s: Pick<ShortShot, "id" | "beat" | "hook">) => {
  const i = v.shots.findIndex((x) => x.id === s.id);
  return s.hook ? `开头「${s.hook.name}」${s.hook.partOf ? "第二段" : ""}` : `#${i + 1}${s.beat ? ` ${s.beat}` : ""}`;
};

export async function auditStage(v: ShortVideo, s: ShortShot, action: string, note: string) {
  logAction(await actorSafe(), { projectId: v.projectId, videoId: v.id, shotId: s.id, shotLabel: shotLabel(v, s), action: STAGE[action] ?? action, detail: note.trim().slice(0, 400), refId: action === "accept" || action === "rework" ? s.videoJobId : s.frameJobId });
}

/** 超次数 / 超预算的这次生成：要先有管理员放行（一次性） */
export function gateOverLimit(videoId: string, shotId: string, kind: JobKind, usd: number): string {
  const a = consumeApproval(videoId, shotId, kind, usd);
  return `管理员 ${a.actor} 放行：${a.reason}`;
}

export async function auditSubmit(v: ShortVideo, s: ShortShot, kind: JobKind, usd: number, model: string, reason: string, approval: string) {
  logAction(await actorSafe(), { projectId: v.projectId, videoId: v.id, shotId: s.id, shotLabel: shotLabel(v, s), action: `提交生成${KIND[kind] ?? kind}`, detail: [reason.trim() && `重做原因：${reason.trim()}`, approval].filter(Boolean).join("；"), usd, model });
}

export function auditJobEnd(job: JobRecord, ok: boolean, usd: number, error = "") {
  logAction(null, { projectId: job.projectId, videoId: job.videoId, shotId: job.shotId, action: ok ? `${KIND[job.kind] ?? job.kind}生成完成` : `${KIND[job.kind] ?? job.kind}生成失败`, detail: ok ? `供应商任务号 ${job.requestId ?? "-"}` : error.slice(0, 300), usd, model: job.model, refId: job.id });
}

/** 新首帧 / 视频出来，替换掉卡片上的旧结果：旧结果进回收站，可恢复 */
export function trashReplaced(v: ShortVideo, s: ShortShot, job: JobRecord) {
  const old = job.kind === "frame" ? s.frameJobId : job.kind === "video" ? s.videoJobId : null;
  if (!old || old === job.id) return;
  const usd = jobUsd(listJobs(v.id), old);
  const label = `${v.title} ${shotLabel(v, s)} 的旧${KIND[job.kind]}`;
  addTrash({ projectId: v.projectId, videoId: v.id, kind: job.kind === "frame" ? "frame" : "video", label, usd, payload: { shotId: s.id, jobId: old, frameJobId: s.frameJobId, replacedBy: job.id }, actor: "系统（新结果替换）" });
  logAction(null, { projectId: v.projectId, videoId: v.id, shotId: s.id, shotLabel: shotLabel(v, s), action: `替换${KIND[job.kind]}`, detail: `旧${KIND[job.kind]}（${usdText(usd)}）进回收站`, usd: 0, refId: old });
}

/** 开头剧本重写 / 手动摘掉时，卡片上的首帧和视频进回收站 */
export async function trashCleared(v: ShortVideo, s: ShortShot, why: string) {
  const jobs = listJobs(v.id);
  const actor = await actorSafe();
  for (const kind of ["frame", "video"] as const) {
    const id = kind === "frame" ? s.frameJobId : s.videoJobId;
    if (!id) continue;
    const usd = jobUsd(jobs, id);
    addTrash({ projectId: v.projectId, videoId: v.id, kind, label: `${v.title} ${shotLabel(v, s)} 的${KIND[kind]}（${why}）`, usd, payload: { shotId: s.id, jobId: id, frameJobId: s.frameJobId }, actor: actor?.name ?? "系统" });
    logAction(actor, { projectId: v.projectId, videoId: v.id, shotId: s.id, shotLabel: shotLabel(v, s), action: `丢弃${KIND[kind]}`, detail: `${why}；${usdText(usd)} 的结果进回收站`, refId: id });
  }
}

/** 删开头 / 删镜头：整组镜头存进回收站，记下原来的位置 */
export async function trashShots(v: ShortVideo, gone: ShortShot[], why: string) {
  if (!gone.length) return;
  const actor = await actorSafe();
  const usd = shotsSpend(listJobs(v.id), gone.map((s) => s.id));
  const label = `${v.title}：${gone.map((s) => shotLabel(v, s)).join("、")}`;
  addTrash({ projectId: v.projectId, videoId: v.id, kind: "shots", label, usd, payload: { shots: gone, at: gone.map((s) => v.shots.findIndex((x) => x.id === s.id)), exportHooks: (v.exportHooks ?? []).filter((id) => gone.some((s) => s.id === id)) }, actor: actor?.name ?? "系统" });
  logAction(actor, { projectId: v.projectId, videoId: v.id, shotId: gone[0].id, shotLabel: label, action: why, detail: `${usdText(usd)} 的结果进回收站，可恢复` });
}

export async function trashShortVideo(v: ShortVideo) {
  const actor = await actorSafe();
  const usd = shotsSpend(listJobs(v.id), v.shots.map((s) => s.id));
  addTrash({ projectId: v.projectId, videoId: v.id, kind: "short_video", label: v.title, usd, payload: { videoId: v.id }, actor: actor?.name ?? "系统" });
  logAction(actor, { projectId: v.projectId, videoId: v.id, action: "删除短视频", detail: `「${v.title}」进回收站（${usdText(usd)} 的结果），可恢复` });
}

/** 每次成功导出：另存 mp4 + 快照，返回版本号 */
export async function recordExport(v: ShortVideo, hook: ShortShot | null, file: string): Promise<number> {
  const actor = await actorSafe();
  const snapshot = buildSnapshot(v, hook, listJobs(v.id));
  const ver = addExportVersion({ projectId: v.projectId, videoId: v.id, hookId: hook?.id ?? null, src: file, snapshot, actor: actor?.name ?? "系统" });
  logAction(actor, { projectId: v.projectId, videoId: v.id, action: "导出成片", detail: `第 ${ver.n} 版${hook ? `，开头「${hook.hook?.name}」` : ""}，${snapshot.shots.length} 镜 ${snapshot.seconds} 秒，字幕${snapshot.captions ? "开" : "关"}`, usd: snapshot.mediaUsd, refId: ver.id });
  return ver.n;
}
