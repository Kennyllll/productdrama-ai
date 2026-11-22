"use server";

import { revalidatePath } from "next/cache";
import { currentActor, requireAdmin } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { getTrash, listTrash, markTrash, TRASH_LABEL, type TrashItem } from "@/lib/trash-repo";
import { getJob, getShortVideo, getShortVideoAny, listJobs, purgeShortVideo, restoreShortVideo, saveShortVideo } from "@/lib/shorts-repo";
import { trashCleared } from "@/lib/short-audit";
import { usdText } from "@/lib/spend";
import type { ShortShot } from "@/lib/shorts";

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });
const busy = (videoId: string, shotIds?: string[]) => listJobs(videoId).some((j) => (j.status === "submitting" || j.status === "submitted") && (!shotIds || shotIds.includes(j.shotId)));

function refreshVideo(projectId: string | null, videoId: string | null) {
  if (projectId) revalidatePath(`/projects/${projectId}/shorts`);
  if (projectId && videoId) revalidatePath(`/projects/${projectId}/shorts/${videoId}`);
  revalidatePath("/trash");
}

export async function listTrashAction(videoId?: string): Promise<TrashItem[]> {
  return listTrash({ videoId });
}

/** 恢复：谁都可以（不花钱、不丢东西）。被换下来的当前结果也进回收站 */
export async function restoreTrashAction(id: string): Promise<Result<string>> {
  try {
    const t = getTrash(id);
    if (!t || t.restoredAt || t.purgedAt) throw new Error("这一项已经恢复或永久删除了");
    const actor = await currentActor();
    let msg = "";
    if (t.kind === "short_video") {
      if (!t.videoId || !restoreShortVideo(t.videoId)) throw new Error("这条短视频已经找不到了");
      msg = `短视频「${t.label}」已恢复`;
    } else {
      const v = t.videoId ? getShortVideo(t.videoId) : null;
      if (!v) throw new Error("所在的短视频已删除：先恢复短视频");
      if (t.kind === "shots") {
        const shots = (t.payload.shots ?? []) as ShortShot[];
        const at = (t.payload.at ?? []) as number[];
        if (shots.some((s) => v.shots.some((x) => x.id === s.id))) throw new Error("这些镜头已经在视频里了");
        shots.forEach((s, k) => v.shots.splice(Math.min(Math.max(at[k] ?? v.shots.length, 0), v.shots.length), 0, s));
        v.shots = [...v.shots.filter((s) => s.hook), ...v.shots.filter((s) => !s.hook)];
        v.exportHooks = [...new Set([...(v.exportHooks ?? []), ...((t.payload.exportHooks ?? []) as string[])])];
        msg = "镜头已放回原位置";
      } else {
        const s = v.shots.find((x) => x.id === t.payload.shotId);
        if (!s) throw new Error("这一镜已经删了：先在回收站恢复这一镜");
        if (busy(v.id, [s.id])) throw new Error("这一镜正在生成，等结束再恢复");
        if (s.stage === "accepted") throw new Error("这一镜已采用：先点“退回返工”再恢复旧版");
        const jobId = String(t.payload.jobId ?? "");
        if (!getJob(jobId)?.hasOutput) throw new Error("旧文件已经不在了，不能恢复");
        if (t.kind === "frame") {
          await trashCleared(v, { ...s, frameJobId: s.frameJobId === jobId ? null : s.frameJobId }, "恢复旧首帧时换下来的");
          s.frameJobId = jobId;
          s.videoJobId = null;
          s.frameCheck = undefined;
          s.stage = "frame_ready";
          msg = "旧首帧已恢复，请重新检查首帧";
        } else {
          const frame = typeof t.payload.frameJobId === "string" ? t.payload.frameJobId : s.frameJobId;
          await trashCleared(v, { ...s, frameJobId: frame === s.frameJobId ? null : s.frameJobId, videoJobId: s.videoJobId === jobId ? null : s.videoJobId }, "恢复旧视频时换下来的");
          s.frameJobId = frame;
          s.videoJobId = jobId;
          s.stage = "video_ready";
          msg = "旧视频已恢复，请重新审片后采用";
        }
      }
      saveShortVideo(v);
    }
    markTrash(id, "restored_at");
    logAction(actor, { projectId: t.projectId, videoId: t.videoId, action: "从回收站恢复", detail: `${TRASH_LABEL[t.kind]}：${t.label}（${usdText(t.usd)}）`, refId: t.id });
    refreshVideo(t.projectId, t.videoId);
    return { result: msg };
  } catch (e) {
    return fail(e);
  }
}

/** 永久删除：只有管理员。整条短视频连文件一起删；费用账本和操作日志不删 */
export async function purgeTrashAction(id: string): Promise<Result<true>> {
  try {
    const actor = await requireAdmin();
    const t = getTrash(id);
    if (!t || t.restoredAt || t.purgedAt) throw new Error("这一项已经恢复或永久删除了");
    if (t.videoId && busy(t.videoId)) throw new Error("这条视频还有任务在生成，等结束再删");
    if (t.kind === "short_video" && t.videoId) {
      const v = getShortVideoAny(t.videoId);
      if (v && getShortVideo(v.id)) throw new Error("这条短视频已经恢复了，不能永久删除");
      purgeShortVideo(t.videoId);
    }
    markTrash(id, "purged_at");
    logAction(actor, { projectId: t.projectId, videoId: t.videoId, action: "永久删除", detail: `${TRASH_LABEL[t.kind]}：${t.label}（${usdText(t.usd)}，费用记录保留）`, refId: t.id });
    refreshVideo(t.projectId, t.videoId);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
