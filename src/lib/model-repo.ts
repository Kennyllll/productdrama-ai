// 产品 3D 模型（TASK-012b）：带材质的 GLB，保存在 uploads/<projectId>/models/。每个项目只保留一个模型。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_MODEL_BYTES = 300 * 1024 * 1024;

export interface ProductModel {
  id: string;
  projectId: string;
  originalName: string;
  fileName: string;
  size: number;
  createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  original_name: string;
  file_name: string;
  size: number;
  created_at: string;
}

const toModel = (r: Row): ProductModel => ({
  id: r.id,
  projectId: r.project_id,
  originalName: r.original_name,
  fileName: r.file_name,
  size: r.size,
  createdAt: r.created_at,
});

export const modelPath = (m: ProductModel) => path.join(UPLOAD_DIR, m.projectId, "models", m.fileName);
export const cadDir = (projectId: string) => path.join(UPLOAD_DIR, projectId, "cad");

/** GLB 文件头：magic "glTF" + version 2 */
export const isGlb = (buf: Buffer) => buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "glTF" && buf.readUInt32LE(4) === 2;

export function getProductModel(projectId: string): ProductModel | null {
  const r = getDb().prepare("SELECT * FROM product_models WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId) as Row | undefined;
  return r ? toModel(r) : null;
}

export function getProductModelById(id: string): ProductModel | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM product_models WHERE id = ?").get(id) as Row | undefined;
  return r ? toModel(r) : null;
}

export function addProductModel(input: { projectId: string; originalName: string; bytes: Buffer }): ProductModel {
  const old = getProductModel(input.projectId);
  if (old) deleteProductModel(old.id);
  const id = randomUUID();
  const fileName = `${id}.glb`;
  const dir = path.join(UPLOAD_DIR, input.projectId, "models");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.bytes);
  getDb()
    .prepare("INSERT INTO product_models (id, project_id, original_name, file_name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.projectId, input.originalName.slice(0, 200), fileName, input.bytes.length, new Date().toISOString());
  return getProductModelById(id)!;
}

export function deleteProductModel(id: string): boolean {
  const m = getProductModelById(id);
  if (!m) return false;
  getDb().prepare("DELETE FROM product_models WHERE id = ?").run(id);
  fs.rmSync(modelPath(m), { force: true });
  fs.rmSync(cadDir(m.projectId), { recursive: true, force: true });
  return true;
}
