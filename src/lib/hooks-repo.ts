// Hook 库读写集中在这里（以后搬 Supabase 只改这一层）
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { PRESET_HOOKS, type HookData, type HookDef } from "@/lib/hooks";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec("CREATE TABLE IF NOT EXISTS hooks (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const n = (d.prepare("SELECT COUNT(*) AS n FROM hooks").get() as { n: number }).n;
    const seeded = d.prepare("SELECT value FROM settings WHERE key = 'hooks_seeded'").get();
    if (!n && !seeded) {
      for (const h of PRESET_HOOKS) createIn(d, h);
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hooks_seeded', '1')").run();
    }
    ready = true;
  }
  return d;
}

function createIn(d: ReturnType<typeof getDb>, data: HookData): string {
  const id = randomUUID();
  const t = new Date().toISOString();
  d.prepare("INSERT INTO hooks (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(data), t, t);
  return id;
}

type Row = { id: string; data: string; updated_at: string };
const toHook = (r: Row): HookDef => ({ ...(JSON.parse(r.data) as HookData), id: r.id, updatedAt: r.updated_at });

export function listHooks(): HookDef[] {
  return (db().prepare("SELECT id, data, updated_at FROM hooks ORDER BY created_at, rowid").all() as Row[]).map(toHook);
}
export function getHook(id: string): HookDef | null {
  const r = db().prepare("SELECT id, data, updated_at FROM hooks WHERE id = ?").get(id) as Row | undefined;
  return r ? toHook(r) : null;
}
export const createHook = (data: HookData) => createIn(db(), data);
export function saveHook(id: string, data: HookData): boolean {
  return db().prepare("UPDATE hooks SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), new Date().toISOString(), id).changes > 0;
}
export function deleteHook(id: string): boolean {
  return db().prepare("DELETE FROM hooks WHERE id = ?").run(id).changes > 0;
}
