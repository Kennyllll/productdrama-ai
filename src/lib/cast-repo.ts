// 选角、彩蛋角色库与参考照的本地存储（TASK-004）。仅在服务端使用。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sanitizeCharacters } from "@/lib/cast";
import { getDb, UPLOAD_DIR } from "@/lib/db";
import type { EasterEgg, LocalCharacter, LocalCharacterInput, PhotoOwner, PhotoRecord, PhotoView } from "@/lib/types";

const now = () => new Date().toISOString();
const PHOTO_TABLE = { character: "character_photos", egg: "egg_photos" } as const;
const EGG_DIR = "_eggs";

interface PhotoRow {
  id: string;
  owner_id: string;
  file_name: string;
  original_name: string;
  mime: string;
  size: number;
}

interface EggRow {
  id: string;
  name: string;
  species: string;
  notes: string;
}

export function listPhotos(owner: PhotoOwner, ownerId: string): PhotoView[] {
  const rows = getDb()
    .prepare(`SELECT id, original_name, size FROM ${PHOTO_TABLE[owner]} WHERE owner_id = ? ORDER BY created_at`)
    .all(ownerId) as PhotoRow[];
  return rows.map((r) => ({ id: r.id, originalName: r.original_name, size: r.size }));
}

function removePhotoFiles(owner: PhotoOwner, ownerId: string) {
  const rows = getDb().prepare(`SELECT file_name FROM ${PHOTO_TABLE[owner]} WHERE owner_id = ?`).all(ownerId) as PhotoRow[];
  for (const r of rows) fs.rmSync(path.join(UPLOAD_DIR, r.file_name), { force: true });
}

// ---- 选角 ----

export function listCharacters(projectId: string): LocalCharacter[] {
  const rows = getDb().prepare("SELECT id, data FROM characters WHERE project_id = ? ORDER BY sort").all(projectId) as {
    id: string;
    data: string;
  }[];
  return sanitizeCharacters(rows.map((r) => ({ ...JSON.parse(r.data), id: r.id }))).map((c) => ({
    ...c,
    photos: listPhotos("character", c.id),
  }));
}

export function saveCharacters(projectId: string, list: LocalCharacterInput[]) {
  const db = getDb();
  db.transaction(() => {
    const existing = (db.prepare("SELECT id FROM characters WHERE project_id = ?").all(projectId) as { id: string }[]).map((r) => r.id);
    const keep = new Set<string>();
    list.forEach((c, i) => {
      const owner = db.prepare("SELECT project_id FROM characters WHERE id = ?").get(c.id) as { project_id: string } | undefined;
      if (owner && owner.project_id !== projectId) return;
      const { id, ...data } = c;
      db.prepare(
        "INSERT INTO characters (id, project_id, sort, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET sort = excluded.sort, data = excluded.data",
      ).run(id, projectId, i, JSON.stringify(data));
      keep.add(id);
    });
    for (const id of existing) {
      if (keep.has(id)) continue;
      removePhotoFiles("character", id);
      db.prepare("DELETE FROM characters WHERE id = ?").run(id);
    }
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), projectId);
  })();
}

export function getCharacterProject(characterId: string): string | null {
  const row = getDb().prepare("SELECT project_id FROM characters WHERE id = ?").get(characterId) as { project_id: string } | undefined;
  return row?.project_id ?? null;
}

// ---- 彩蛋角色库（工具级，不属于某个项目） ----

const toEgg = (r: EggRow): EasterEgg => ({ id: r.id, name: r.name, species: r.species, notes: r.notes, photos: listPhotos("egg", r.id) });

export function listEggs(): EasterEgg[] {
  return (getDb().prepare("SELECT id, name, species, notes FROM easter_eggs ORDER BY created_at").all() as EggRow[]).map(toEgg);
}

export function getEgg(id: string): EasterEgg | null {
  const row = getDb().prepare("SELECT id, name, species, notes FROM easter_eggs WHERE id = ?").get(id) as EggRow | undefined;
  return row ? toEgg(row) : null;
}

export function createEgg(name: string, species: string): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO easter_eggs (id, name, species, notes, created_at) VALUES (?, ?, ?, '', ?)").run(id, name, species, now());
  return id;
}

export function updateEgg(id: string, e: { name: string; species: string; notes: string }): boolean {
  return getDb().prepare("UPDATE easter_eggs SET name = ?, species = ?, notes = ? WHERE id = ?").run(e.name, e.species, e.notes, id).changes > 0;
}

export function deleteEgg(id: string): boolean {
  if (!getEgg(id)) return false;
  getDb().prepare("DELETE FROM easter_eggs WHERE id = ?").run(id);
  fs.rmSync(path.join(UPLOAD_DIR, EGG_DIR, id), { recursive: true, force: true });
  return true;
}

export function getProjectEggId(projectId: string): string | null {
  const row = getDb().prepare("SELECT egg_id FROM project_eggs WHERE project_id = ?").get(projectId) as { egg_id: string | null } | undefined;
  return row?.egg_id ?? null;
}

export function setProjectEgg(projectId: string, eggId: string | null) {
  getDb()
    .prepare("INSERT INTO project_eggs (project_id, egg_id) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET egg_id = excluded.egg_id")
    .run(projectId, eggId);
}

// ---- 参考照 ----

export function countPhotos(owner: PhotoOwner, ownerId: string): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM ${PHOTO_TABLE[owner]} WHERE owner_id = ?`).get(ownerId) as { n: number }).n;
}

/** 参考照目录：角色放在项目目录下（删除项目时一并删除），彩蛋角色放在 uploads/_eggs/<角色ID>/ */
export function photoDir(owner: PhotoOwner, ownerId: string, projectId?: string): string {
  return owner === "egg" ? path.join(EGG_DIR, ownerId) : path.join(projectId ?? "", "characters");
}

export function addPhoto(input: {
  owner: PhotoOwner;
  ownerId: string;
  dir: string;
  originalName: string;
  bytes: Buffer;
  mime: string;
  ext: string;
}) {
  const id = randomUUID();
  const rel = path.join(input.dir, `${id}.${input.ext}`);
  fs.mkdirSync(path.join(UPLOAD_DIR, input.dir), { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, rel), input.bytes);
  getDb()
    .prepare(`INSERT INTO ${PHOTO_TABLE[input.owner]} (id, owner_id, file_name, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.ownerId, rel, input.originalName, input.mime, input.bytes.length, now());
}

export function findPhoto(id: string): PhotoRecord | null {
  for (const owner of ["character", "egg"] as const) {
    const r = getDb().prepare(`SELECT * FROM ${PHOTO_TABLE[owner]} WHERE id = ?`).get(id) as PhotoRow | undefined;
    if (r) return { id: r.id, ownerType: owner, ownerId: r.owner_id, fileName: r.file_name, originalName: r.original_name, mime: r.mime, size: r.size };
  }
  return null;
}

export const photoPath = (p: PhotoRecord) => path.join(UPLOAD_DIR, p.fileName);

export function deletePhoto(id: string): boolean {
  const p = findPhoto(id);
  if (!p) return false;
  getDb().prepare(`DELETE FROM ${PHOTO_TABLE[p.ownerType]} WHERE id = ?`).run(id);
  fs.rmSync(photoPath(p), { force: true });
  return true;
}
