// 操作日志：只追加，不改不删。谁、何时、哪个视频哪一镜、做了什么、花多少、走哪家
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { providerOf } from "@/lib/admin-core";
import type { Actor } from "@/lib/admin";

export interface AuditEntry {
  id: string;
  at: string;
  role: string;
  actor: string;
  projectId: string | null;
  videoId: string | null;
  shotId: string | null;
  shotLabel: string;
  action: string;
  detail: string;
  usd: number | null;
  provider: string;
  model: string;
  refId: string | null;
}

export type AuditInput = Partial<Omit<AuditEntry, "id" | "at" | "role" | "actor" | "action">> & { action: string };

/** 写日志失败不能挡住正事：吞掉错误只打控制台 */
export function logAction(actor: Pick<Actor, "role" | "name"> | null, e: AuditInput): void {
  try {
    const model = e.model ?? "";
    getDb()
      .prepare("INSERT INTO audit_log (id, at, role, actor, project_id, video_id, shot_id, shot_label, action, detail, usd, provider, model, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), new Date().toISOString(), actor?.role ?? "system", actor?.name ?? "系统", e.projectId ?? null, e.videoId ?? null, e.shotId ?? null, e.shotLabel ?? "", e.action, (e.detail ?? "").slice(0, 2000), e.usd ?? null, e.provider ?? providerOf(model), model, e.refId ?? null);
  } catch (err) {
    console.error("[audit] 写日志失败", err);
  }
}

export interface AuditFilter {
  projectId?: string;
  videoId?: string;
  action?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

interface Row {
  id: string;
  at: string;
  role: string;
  actor: string;
  project_id: string | null;
  video_id: string | null;
  shot_id: string | null;
  shot_label: string;
  action: string;
  detail: string;
  usd: number | null;
  provider: string;
  model: string;
  ref_id: string | null;
}

export function listLogs(f: AuditFilter = {}): AuditEntry[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const eq = (col: string, v?: string) => {
    if (v) {
      where.push(`${col} = ?`);
      args.push(v);
    }
  };
  eq("project_id", f.projectId);
  eq("video_id", f.videoId);
  eq("action", f.action);
  eq("actor", f.actor);
  if (f.from) {
    where.push("at >= ?");
    args.push(f.from);
  }
  if (f.to) {
    where.push("at < ?");
    args.push(f.to);
  }
  if (f.q) {
    where.push("(detail LIKE ? OR shot_label LIKE ? OR model LIKE ?)");
    args.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  args.push(Math.min(Math.max(f.limit ?? 300, 1), 2000));
  const rows = getDb()
    .prepare(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY at DESC, rowid DESC LIMIT ?`)
    .all(...args) as Row[];
  return rows.map((r) => ({ id: r.id, at: r.at, role: r.role, actor: r.actor, projectId: r.project_id, videoId: r.video_id, shotId: r.shot_id, shotLabel: r.shot_label, action: r.action, detail: r.detail, usd: r.usd, provider: r.provider, model: r.model, refId: r.ref_id }));
}

export function logFacets(): { actions: string[]; actors: string[] } {
  const d = getDb();
  return {
    actions: (d.prepare("SELECT DISTINCT action FROM audit_log ORDER BY action").all() as { action: string }[]).map((r) => r.action),
    actors: (d.prepare("SELECT DISTINCT actor FROM audit_log ORDER BY actor").all() as { actor: string }[]).map((r) => r.actor),
  };
}
