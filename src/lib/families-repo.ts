// 家庭库的本机存储（所有产品共用）。以后搬 Supabase 只改这个文件。
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { PRESET_FAMILIES, type Family, type FamilyData } from "@/lib/families";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec("CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const n = (d.prepare("SELECT COUNT(*) AS n FROM families").get() as { n: number }).n;
    const seeded = d.prepare("SELECT value FROM settings WHERE key = 'families_seeded'").get();
    if (!n && !seeded) {
      for (const f of PRESET_FAMILIES) createFamilyIn(d, f);
      d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('families_seeded', '1')").run();
    }
    ready = true;
  }
  return d;
}

function createFamilyIn(d: ReturnType<typeof getDb>, data: FamilyData): string {
  const id = randomUUID();
  const t = new Date().toISOString();
  d.prepare("INSERT INTO families (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(data), t, t);
  return id;
}

type Row = { id: string; data: string; updated_at: string };
const toFamily = (r: Row): Family => ({ ...(JSON.parse(r.data) as FamilyData), id: r.id, updatedAt: r.updated_at });

export function listFamilies(): Family[] {
  return (db().prepare("SELECT id, data, updated_at FROM families ORDER BY created_at, rowid").all() as Row[]).map(toFamily);
}
export function getFamily(id: string): Family | null {
  const r = db().prepare("SELECT id, data, updated_at FROM families WHERE id = ?").get(id) as Row | undefined;
  return r ? toFamily(r) : null;
}
/** 视频某个家庭位选的家庭；没选 / 已删 = null */
export function castOf(families: Record<string, string> | undefined, slot: number): Family | null {
  const id = families?.[String(slot)];
  return id ? getFamily(id) : null;
}
export const createFamily = (data: FamilyData) => createFamilyIn(db(), data);
export function saveFamily(id: string, data: FamilyData): boolean {
  return db().prepare("UPDATE families SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), new Date().toISOString(), id).changes > 0;
}
export function deleteFamily(id: string): boolean {
  return db().prepare("DELETE FROM families WHERE id = ?").run(id).changes > 0;
}
