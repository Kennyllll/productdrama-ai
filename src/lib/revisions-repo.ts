// 规则、Hook 模板、家庭资料的历史版本：每次改动前把旧内容存一份，回退 = 用旧内容再存一次（新的一版），历史不丢
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type RevEntity = "rule" | "hook" | "family";
export type RevOp = "create" | "update" | "delete" | "revert";
export const REV_OP_LABEL: Record<RevOp, string> = { create: "新建", update: "修改", delete: "删除", revert: "回退" };

export interface Revision {
  id: string;
  entityType: RevEntity;
  entityId: string;
  projectId: string | null;
  label: string;
  /** 改动之后的内容（删除 = 删之前的内容） */
  data: unknown;
  op: RevOp;
  actor: string;
  reason: string;
  createdAt: string;
}

interface Row {
  id: string;
  entity_type: string;
  entity_id: string;
  project_id: string | null;
  label: string;
  data: string | null;
  op: string;
  actor: string;
  reason: string;
  created_at: string;
}
const toRev = (r: Row): Revision => ({ id: r.id, entityType: r.entity_type as RevEntity, entityId: r.entity_id, projectId: r.project_id, label: r.label, data: r.data ? JSON.parse(r.data) : null, op: r.op as RevOp, actor: r.actor, reason: r.reason, createdAt: r.created_at });

/** 记一版。第一次记某个对象时，如果给了改之前的内容，先补一版「原始」，这样第一次改动也能回退 */
export function addRevision(r: { entityType: RevEntity; entityId: string; projectId?: string | null; label: string; data: unknown; op: RevOp; actor: string; reason?: string; before?: unknown }) {
  const d = getDb();
  const ins = d.prepare("INSERT INTO revisions (id, entity_type, entity_id, project_id, label, data, op, actor, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  d.transaction(() => {
    const has = d.prepare("SELECT 1 FROM revisions WHERE entity_type = ? AND entity_id = ? LIMIT 1").get(r.entityType, r.entityId);
    const t = Date.now();
    if (!has && r.before !== undefined && r.op !== "create") ins.run(randomUUID(), r.entityType, r.entityId, r.projectId ?? null, r.label, JSON.stringify(r.before), "create", "（改动前的原始内容）", "", new Date(t - 1).toISOString());
    ins.run(randomUUID(), r.entityType, r.entityId, r.projectId ?? null, r.label, r.data === undefined ? null : JSON.stringify(r.data), r.op, r.actor, (r.reason ?? "").slice(0, 200), new Date(t).toISOString());
  })();
}

export function listRevisions(entityType: RevEntity, f: { entityId?: string; projectId?: string } = {}): Revision[] {
  const where = ["entity_type = ?"];
  const args: string[] = [entityType];
  if (f.entityId) {
    where.push("entity_id = ?");
    args.push(f.entityId);
  }
  if (f.projectId) {
    where.push("project_id = ?");
    args.push(f.projectId);
  }
  return (getDb().prepare(`SELECT * FROM revisions WHERE ${where.join(" AND ")} ORDER BY created_at DESC, rowid DESC LIMIT 300`).all(...args) as Row[]).map(toRev);
}

export function getRevision(id: string): Revision | null {
  const r = getDb().prepare("SELECT * FROM revisions WHERE id = ?").get(id) as Row | undefined;
  return r ? toRev(r) : null;
}
