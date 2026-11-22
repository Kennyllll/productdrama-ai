// 管理员放行：超预算 / 超次数的那一次生成。一次性、15 分钟内有效、绑定视频 + 镜头 + 类型 + 金额
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { APPROVAL_TTL_MS } from "@/lib/admin-core";

export function addApproval(a: { videoId: string; shotId: string; jobKind: string; usd: number; reason: string; actor: string }): string {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare("INSERT INTO approvals (id, kind, video_id, shot_id, job_kind, usd, reason, actor, created_at, expires_at) VALUES (?, 'over_limit', ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, a.videoId, a.shotId, a.jobKind, a.usd, a.reason, a.actor, new Date(now).toISOString(), new Date(now + APPROVAL_TTL_MS).toISOString());
  return id;
}

/** 找一张还没用、没过期、金额对得上的批准，用掉它。没有就报错 */
export function consumeApproval(videoId: string, shotId: string, jobKind: string, usd: number): { id: string; actor: string; reason: string } {
  const d = getDb();
  const r = d
    .prepare("SELECT id, actor, reason FROM approvals WHERE video_id = ? AND shot_id = ? AND job_kind = ? AND used_at IS NULL AND expires_at > ? AND ABS(usd - ?) < 0.005 ORDER BY created_at DESC LIMIT 1")
    .get(videoId, shotId, jobKind, new Date().toISOString(), usd) as { id: string; actor: string; reason: string } | undefined;
  if (!r) throw new Error("超限要管理员放行：在审批框里输入管理员 PIN 并写原因（放行 15 分钟内有效，只能用一次）");
  d.prepare("UPDATE approvals SET used_at = ? WHERE id = ?").run(new Date().toISOString(), r.id);
  return r;
}

export function hasApproval(videoId: string, shotId: string, jobKind: string, usd: number): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM approvals WHERE video_id = ? AND shot_id = ? AND job_kind = ? AND used_at IS NULL AND expires_at > ? AND ABS(usd - ?) < 0.005")
    .get(videoId, shotId, jobKind, new Date().toISOString(), usd);
}
