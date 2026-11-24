// 回收站：删掉 / 替换掉的付费结果先放这里，能恢复。生成记录和费用账本一直保留，不跟着删
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type TrashKind = "shots" | "frame" | "video" | "short_video" | "portrait" | "model";
export const TRASH_LABEL: Record<TrashKind, string> = { shots: "镜头 / 开头", frame: "首帧", video: "视频", short_video: "整条短视频", portrait: "家庭定妆照草稿", model: "3D 模型" };

export interface TrashItem {
  id: string;
  projectId: string | null;
  videoId: string | null;
  kind: TrashKind;
  label: string;
  usd: number;
  payload: Record<string, unknown>;
  actor: string;
  createdAt: string;
  restoredAt: string | null;
  purgedAt: string | null;
}

interface Row {
  id: string;
  project_id: string | null;
  video_id: string | null;
  kind: string;
  label: string;
  usd: number;
  payload: string;
  actor: string;
  created_at: string;
  restored_at: string | null;
  purged_at: string | null;
}
const toItem = (r: Row): TrashItem => ({ id: r.id, projectId: r.project_id, videoId: r.video_id, kind: r.kind as TrashKind, label: r.label, usd: r.usd, payload: JSON.parse(r.payload) as Record<string, unknown>, actor: r.actor, createdAt: r.created_at, restoredAt: r.restored_at, purgedAt: r.purged_at });

export function addTrash(t: { projectId: string | null; videoId: string | null; kind: TrashKind; label: string; usd: number; payload: Record<string, unknown>; actor: string }): string {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO trash (id, project_id, video_id, kind, label, usd, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, t.projectId, t.videoId, t.kind, t.label, Math.round(t.usd * 100) / 100, JSON.stringify(t.payload), t.actor, new Date().toISOString());
  return id;
}

export function listTrash(f: { projectId?: string; videoId?: string; all?: boolean } = {}): TrashItem[] {
  const where = [f.all ? "1 = 1" : "restored_at IS NULL AND purged_at IS NULL"];
  const args: string[] = [];
  if (f.projectId) {
    where.push("project_id = ?");
    args.push(f.projectId);
  }
  if (f.videoId) {
    where.push("video_id = ?");
    args.push(f.videoId);
  }
  return (getDb().prepare(`SELECT * FROM trash WHERE ${where.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT 500`).all(...args) as Row[]).map(toItem);
}

export function getTrash(id: string): TrashItem | null {
  const r = getDb().prepare("SELECT * FROM trash WHERE id = ?").get(id) as Row | undefined;
  return r ? toItem(r) : null;
}

export function markTrash(id: string, field: "restored_at" | "purged_at") {
  getDb().prepare(`UPDATE trash SET ${field} = ? WHERE id = ?`).run(new Date().toISOString(), id);
}
