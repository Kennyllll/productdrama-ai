// 回退用：按 id 把旧内容写回去（对象被删了就重新插回同一个 id）
import "server-only";
import { getDb } from "@/lib/db";
import type { Rule } from "@/lib/production-repo";

const now = () => new Date().toISOString();

export function putHookRow(id: string, data: unknown) {
  const t = now();
  getDb().prepare("INSERT INTO hooks (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(id, JSON.stringify(data), t, t);
}

export function putFamilyRow(id: string, data: unknown) {
  const t = now();
  getDb().prepare("INSERT INTO families (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").run(id, JSON.stringify(data), t, t);
}

export function putRuleRow(projectId: string, r: Rule) {
  getDb()
    .prepare("INSERT INTO rules (id, project_id, scope, layer, level, text, source, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET layer = excluded.layer, level = excluded.level, text = excluded.text, source = excluded.source")
    .run(r.id, projectId, r.scope ?? "project", r.layer, r.level, r.text, r.source ?? "", r.origin ?? "user", now());
}

export function dropRow(table: "hooks" | "families", id: string) {
  getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

export function dropRule(projectId: string, id: string) {
  getDb().prepare("DELETE FROM rules WHERE project_id = ? AND id = ?").run(projectId, id);
}
