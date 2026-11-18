// 家庭库的本机存储（所有产品共用）。以后搬 Supabase 只改这个文件。
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { localPath, storageKey } from "@/lib/storage";
import { PRESET_FAMILIES, presetMember, type Bi, type Family, type FamilyData, type FamilyMember, type Portrait } from "@/lib/families";

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
    migrateWear(d);
    // 家庭库不属于任何项目，花费单独记；删家庭不删账（钱已经花了）
    d.exec("CREATE TABLE IF NOT EXISTS family_ledger (id TEXT PRIMARY KEY, family_id TEXT NOT NULL, family TEXT NOT NULL, member TEXT NOT NULL, look TEXT NOT NULL, model TEXT NOT NULL, usd REAL NOT NULL, created_at TEXT NOT NULL)");
    ready = true;
  }
  return d;
}

/** 一次性：节日衣服从「整家同款」改成每人一套。预置成员补预置的，自己加的成员沿用原来整家那套 */
function migrateWear(d: ReturnType<typeof getDb>) {
  if (d.prepare("SELECT value FROM settings WHERE key = 'families_wear_v2'").get()) return;
  const rows = d.prepare("SELECT id, data FROM families").all() as { id: string; data: string }[];
  for (const r of rows) {
    const f = JSON.parse(r.data) as FamilyData & { themeWear?: Record<string, Bi> };
    const legacy = f.themeWear ?? {};
    f.members = f.members.map((m) => ({ ...m, themeWear: Object.keys(m.themeWear ?? {}).length ? m.themeWear : (presetMember(m.id)?.themeWear ?? { ...legacy }) }));
    delete f.themeWear;
    d.prepare("UPDATE families SET data = ? WHERE id = ?").run(JSON.stringify(f), r.id);
  }
  d.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('families_wear_v2', '1')").run();
}

function createFamilyIn(d: ReturnType<typeof getDb>, data: FamilyData): string {
  const id = randomUUID();
  const t = new Date().toISOString();
  d.prepare("INSERT INTO families (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(data), t, t);
  return id;
}

type Row = { id: string; data: string; updated_at: string };
const toFamily = (r: Row): Family => {
  const f = JSON.parse(r.data) as FamilyData;
  return { ...f, members: f.members.map((m) => ({ ...m, themeWear: m.themeWear ?? {} })), id: r.id, updatedAt: r.updated_at };
};

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
const PHOTO_KEYS = ["portraits", "portraitDrafts", "portraitJobs"] as const;
/** 页面保存文字：定妆照只由服务器写，按成员 id 保留原来的 */
export function saveFamily(id: string, data: FamilyData): boolean {
  const old = getFamily(id);
  const members = data.members.map((m) => {
    const o = old?.members.find((x) => x.id === m.id);
    const keep: Partial<FamilyMember> = {};
    for (const k of PHOTO_KEYS) if (o?.[k]) Object.assign(keep, { [k]: o[k] });
    return { ...m, ...keep };
  });
  return db().prepare("UPDATE families SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...data, members }), new Date().toISOString(), id).changes > 0;
}
/** 只改一个成员的定妆照字段（后台出图完成时用，不碰页面上正在改的文字） */
export function updateMember(familyId: string, memberId: string, fn: (m: FamilyMember) => void): FamilyMember | null {
  const f = getFamily(familyId);
  const m = f?.members.find((x) => x.id === memberId);
  if (!f || !m) return null;
  fn(m);
  const { id: _id, updatedAt: _u, ...data } = f;
  void _id;
  void _u;
  db().prepare("UPDATE families SET data = ? WHERE id = ?").run(JSON.stringify(data), familyId);
  return m;
}
export function deleteFamily(id: string): boolean {
  return db().prepare("DELETE FROM families WHERE id = ?").run(id).changes > 0;
}

export interface FamilyLedgerEntry {
  id: string;
  familyId: string;
  family: string;
  member: string;
  look: string;
  model: string;
  usd: number;
  createdAt: string;
}

export function addFamilyLedger(e: Omit<FamilyLedgerEntry, "id" | "createdAt">) {
  db()
    .prepare("INSERT INTO family_ledger (id, family_id, family, member, look, model, usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), e.familyId, e.family, e.member, e.look, e.model, e.usd, new Date().toISOString());
}

export function listFamilyLedger(): FamilyLedgerEntry[] {
  const rows = db().prepare("SELECT * FROM family_ledger ORDER BY created_at DESC, rowid DESC").all() as Record<string, string | number>[];
  return rows.map((r) => ({ id: String(r.id), familyId: String(r.family_id), family: String(r.family), member: String(r.member), look: String(r.look), model: String(r.model), usd: Number(r.usd), createdAt: String(r.created_at) }));
}

/** 定妆照文件：uploads/families/<familyId>/<file> */
export const portraitKey = (familyId: string, file: string) => storageKey("families", familyId, file);
export const portraitPath = (familyId: string, p: Pick<Portrait, "file">) => localPath(portraitKey(familyId, p.file));
