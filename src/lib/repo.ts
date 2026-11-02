// 本地项目 / 产品 / 素材的数据访问（TASK-002）。仅在服务端使用。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";
import { DEMO_PROJECT_ID, demoProject, emptyBible, localStepStatus } from "@/lib/mock/demo";
import type { AssetKind, AssetRecord, LocalProduct, ProductBibleField, Project } from "@/lib/types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTOS = 20;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ProjectRow {
  id: string;
  name: string;
  brand: string;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  name: string;
  category: string;
  selling_points: string;
  bible: string;
}

interface AssetRow {
  id: string;
  project_id: string;
  kind: AssetKind;
  angle: string;
  original_name: string;
  file_name: string;
  mime: string;
  size: number;
  created_at: string;
}

const now = () => new Date().toISOString();

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand || "未填写品牌",
    updatedAt: r.updated_at,
    episodeCount: 4,
    secondsPerEpisode: 45,
    currentStep: "product",
    stepStatus: localStepStatus,
    source: "local",
  };
}

function toAsset(r: AssetRow): AssetRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    angle: r.angle,
    originalName: r.original_name,
    fileName: r.file_name,
    mime: r.mime,
    size: r.size,
    createdAt: r.created_at,
  };
}

function touch(projectId: string) {
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now(), projectId);
}

export function listLocalProjects(): Project[] {
  const rows = getDb().prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRow[];
  return rows.map(toProject);
}

export function findLocalProject(id: string): Project | null {
  if (!ID_RE.test(id)) return null;
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export function findProject(id: string): Project | null {
  return id === DEMO_PROJECT_ID ? demoProject : findLocalProject(id);
}

export function createProject(name: string, brand: string): string {
  const id = randomUUID();
  const t = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO projects (id, name, brand, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, name, brand, t, t);
    db.prepare("INSERT INTO products (project_id, bible) VALUES (?, ?)").run(id, JSON.stringify(emptyBible));
  })();
  return id;
}

export function deleteProject(id: string): boolean {
  if (!ID_RE.test(id)) return false;
  const res = getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  fs.rmSync(path.join(UPLOAD_DIR, id), { recursive: true, force: true });
  return res.changes > 0;
}

export function getProduct(projectId: string): LocalProduct | null {
  const row = getDb()
    .prepare("SELECT name, category, selling_points, bible FROM products WHERE project_id = ?")
    .get(projectId) as ProductRow | undefined;
  if (!row) return null;
  const saved = JSON.parse(row.bible) as ProductBibleField[];
  return {
    name: row.name,
    category: row.category,
    sellingPoints: JSON.parse(row.selling_points) as string[],
    bible: emptyBible.map((field) => saved.find((s) => s.key === field.key) ?? field),
  };
}

export function saveProduct(projectId: string, product: LocalProduct) {
  getDb()
    .prepare("UPDATE products SET name = ?, category = ?, selling_points = ?, bible = ? WHERE project_id = ?")
    .run(product.name, product.category, JSON.stringify(product.sellingPoints), JSON.stringify(product.bible), projectId);
  touch(projectId);
}

export function listAssets(projectId: string): AssetRecord[] {
  const rows = getDb().prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at").all(projectId) as AssetRow[];
  return rows.map(toAsset);
}

export function countAssets(projectId: string, kind: AssetKind): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM assets WHERE project_id = ? AND kind = ?").get(projectId, kind) as { n: number };
  return row.n;
}

export function getAsset(id: string): AssetRecord | null {
  if (!ID_RE.test(id)) return null;
  const row = getDb().prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined;
  return row ? toAsset(row) : null;
}

export function assetPath(asset: AssetRecord): string {
  return path.join(UPLOAD_DIR, asset.projectId, asset.fileName);
}

export function addAsset(input: {
  projectId: string;
  kind: AssetKind;
  angle: string;
  originalName: string;
  bytes: Buffer;
  mime: string;
  ext: string;
}): AssetRecord {
  if (input.kind === "logo") {
    for (const old of listAssets(input.projectId).filter((a) => a.kind === "logo")) deleteAsset(old.id);
  }
  const id = randomUUID();
  const fileName = `${id}.${input.ext}`;
  const dir = path.join(UPLOAD_DIR, input.projectId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.bytes);
  getDb()
    .prepare(
      "INSERT INTO assets (id, project_id, kind, angle, original_name, file_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.projectId, input.kind, input.angle, input.originalName, fileName, input.mime, input.bytes.length, now());
  touch(input.projectId);
  return getAsset(id)!;
}

export function deleteAsset(id: string): boolean {
  const asset = getAsset(id);
  if (!asset) return false;
  getDb().prepare("DELETE FROM assets WHERE id = ?").run(id);
  fs.rmSync(assetPath(asset), { force: true });
  touch(asset.projectId);
  return true;
}

/** 按文件头识别图片类型，不信任扩展名或浏览器提供的 MIME */
export function detectImageType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  const head = buf.subarray(0, 2048).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return { mime: "image/svg+xml", ext: "svg" };
  }
  return null;
}
