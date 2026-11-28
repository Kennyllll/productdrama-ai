// 本地项目 / 产品 / 素材的数据访问（TASK-002）。仅在服务端使用。
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { localPath, putFile, removeFile, removePrefix, storageKey } from "@/lib/storage";
import { DEMO_PROJECT_ID, demoProject, emptyBible, localStepStatus } from "@/lib/mock/demo";
import { emptyCreative, sanitizeCreative, sanitizeScript } from "@/lib/creative";
import type { AssetKind, AssetRecord, LocalCreative, LocalProduct, LocalScript, ProductBibleField, Project, ProjectKind } from "@/lib/types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTOS = 20;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ProjectRow {
  id: string;
  name: string;
  brand: string;
  kind: string;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  name: string;
  category: string;
  ride_kind: string;
  selling_points: string;
  bible: string;
}

interface AssetRow {
  id: string;
  project_id: string;
  kind: AssetKind;
  angle: string;
  color_id: string | null;
  note: string | null;
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
    kind: r.kind === "product" ? "product" : "series",
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
    colorId: r.color_id ?? null,
    note: r.note ?? "",
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

export function createProject(name: string, brand: string, kind: ProjectKind = "series"): string {
  const id = randomUUID();
  const t = now();
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO projects (id, name, brand, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, brand, kind, t, t);
    // 新建时填的产品名称直接带进产品资料，免得再填一遍
    db.prepare("INSERT INTO products (project_id, name, bible) VALUES (?, ?, ?)").run(id, name.trim(), JSON.stringify(emptyBible));
  })();
  return id;
}

export function deleteProject(id: string): boolean {
  if (!ID_RE.test(id)) return false;
  const res = getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
  removePrefix(storageKey(id));
  return res.changes > 0;
}

export function getProduct(projectId: string): LocalProduct | null {
  const row = getDb()
    .prepare("SELECT name, category, ride_kind, selling_points, bible FROM products WHERE project_id = ?")
    .get(projectId) as ProductRow | undefined;
  if (!row) return null;
  const saved = JSON.parse(row.bible) as ProductBibleField[];
  return {
    name: row.name,
    category: row.category,
    rideKind: row.ride_kind,
    sellingPoints: JSON.parse(row.selling_points) as string[],
    bible: emptyBible.map((field) => saved.find((s) => s.key === field.key) ?? field),
  };
}

export function saveProduct(projectId: string, product: LocalProduct) {
  const old = getDb().prepare("SELECT name FROM products WHERE project_id = ?").get(projectId) as { name: string } | undefined;
  // 项目名原来跟产品名一样：产品改名时项目中心 / 侧栏 / 面包屑一起改
  if (old && product.name && old.name !== product.name) getDb().prepare("UPDATE projects SET name = ? WHERE id = ? AND name = ?").run(product.name, projectId, old.name);
  getDb()
    .prepare("UPDATE products SET name = ?, category = ?, ride_kind = COALESCE(?, ride_kind), selling_points = ?, bible = ? WHERE project_id = ?")
    .run(product.name, product.category, product.rideKind ?? null, JSON.stringify(product.sellingPoints), JSON.stringify(product.bible), projectId);
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

export function assetKey(asset: AssetRecord): string {
  return storageKey(asset.projectId, asset.fileName);
}

export function assetPath(asset: AssetRecord): string {
  return localPath(assetKey(asset));
}

export function addAsset(input: {
  projectId: string;
  kind: AssetKind;
  angle: string;
  originalName: string;
  bytes: Buffer;
  mime: string;
  ext: string;
  colorId?: string | null;
  note?: string;
}): AssetRecord {
  if (input.kind === "logo") {
    for (const old of listAssets(input.projectId).filter((a) => a.kind === "logo")) deleteAsset(old.id);
  }
  // 白底照 / 颜色款照：同一面只留最新一张
  if (input.kind === "white_photo" || input.kind === "color_photo") {
    for (const old of listAssets(input.projectId).filter((a) => a.kind === input.kind && a.angle === input.angle && (a.colorId ?? null) === (input.colorId ?? null))) deleteAsset(old.id);
  }
  const id = randomUUID();
  const fileName = `${id}.${input.ext}`;
  putFile(storageKey(input.projectId, fileName), input.bytes);
  getDb()
    .prepare(
      "INSERT INTO assets (id, project_id, kind, angle, original_name, file_name, mime, size, created_at, color_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.projectId, input.kind, input.angle, input.originalName, fileName, input.mime, input.bytes.length, now(), input.colorId ?? null, (input.note ?? "").slice(0, 200));
  touch(input.projectId);
  return getAsset(id)!;
}

export function deleteAsset(id: string): boolean {
  const asset = getAsset(id);
  if (!asset) return false;
  getDb().prepare("DELETE FROM assets WHERE id = ?").run(id);
  removeFile(assetKey(asset));
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

type JsonTable = "creatives" | "scripts";

function getJson(table: JsonTable, projectId: string): unknown {
  const row = getDb().prepare(`SELECT data FROM ${table} WHERE project_id = ?`).get(projectId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

function putJson(table: JsonTable, projectId: string, data: unknown) {
  getDb()
    .prepare(`INSERT INTO ${table} (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data`)
    .run(projectId, JSON.stringify(data));
  touch(projectId);
}

export function getCreative(projectId: string): LocalCreative {
  const data = getJson("creatives", projectId);
  return data ? sanitizeCreative(data) : emptyCreative;
}

export function saveCreative(projectId: string, creative: LocalCreative) {
  putJson("creatives", projectId, creative);
}

export function getScript(projectId: string): LocalScript | null {
  const data = getJson("scripts", projectId);
  return data ? sanitizeScript(data) : null;
}

export function saveScript(projectId: string, script: LocalScript) {
  putJson("scripts", projectId, script);
}
