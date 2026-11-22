// 产品 3D 模型（TASK-012b）：GLB 保存在 uploads/<projectId>/models/。
// 一个产品只有一个白模（color_id 为空，形状准就行，可上传或用白底照 AI 建模）；
// 每个颜色款在白模上贴一次颜色（color_id），所有视频共用。AI 建的模型先是「待审核」，通过后才会被使用。
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { localPath, putFile, removeFile, removePrefix, storageKey } from "@/lib/storage";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_MODEL_BYTES = 300 * 1024 * 1024;

export type ModelStatus = "review" | "approved" | "rejected" | "archived";

export interface ProductModel {
  id: string;
  projectId: string;
  originalName: string;
  fileName: string;
  size: number;
  createdAt: string;
  status: ModelStatus;
  /** 空 = 白模 / 原模型；有值 = 这个颜色款的贴色模型 */
  colorId: string | null;
  /** upload = 上传的 GLB；step = 工厂 STEP 转的（尺寸零件都准）；fal = 照片 AI 建的（近似） */
  source: "upload" | "fal" | "step";
  note: string;
  lengthCm: number | null;
  /** fal 返回的文件地址：给白模贴色时直接引用，不用再上传 */
  remoteUrl: string | null;
}

interface Row {
  id: string;
  project_id: string;
  original_name: string;
  file_name: string;
  size: number;
  created_at: string;
  status: string;
  color_id: string | null;
  source: string;
  note: string;
  length_cm: number | null;
  remote_url: string | null;
}

const toModel = (r: Row): ProductModel => ({
  id: r.id,
  projectId: r.project_id,
  originalName: r.original_name,
  fileName: r.file_name,
  size: r.size,
  createdAt: r.created_at,
  status: (["review", "approved", "rejected", "archived"].includes(r.status) ? r.status : "approved") as ModelStatus,
  colorId: r.color_id,
  source: r.source === "fal" ? "fal" : r.source === "step" ? "step" : "upload",
  note: r.note ?? "",
  lengthCm: r.length_cm,
  remoteUrl: r.remote_url,
});

export const modelKey = (m: ProductModel) => storageKey(m.projectId, "models", m.fileName);
export const modelPath = (m: ProductModel) => localPath(modelKey(m));
export const cadDir = (projectId: string) => localPath(storageKey(projectId, "cad"));
const refsKey = (projectId: string, colorId: string | null) => storageKey(projectId, "cad", "short-refs", ...(colorId ? [colorId] : []));

/** 工厂 STEP 原文件（换朝上的轴时重新转换用） */
export const stepKey = (m: ProductModel) => storageKey(m.projectId, "models", `${m.id}.step`);

/** 产品锁定等级：exact = 工厂文件（STEP / 带材质 GLB），出图时形状照模型；approx = 照片 AI 建模，只管位置和方向 */
export const modelPrecision = (m: ProductModel | null): "exact" | "approx" | "none" => (!m ? "none" : m.source === "fal" ? "approx" : "exact");
export const PRECISION_LABEL = { exact: "精确（工厂文件）", approx: "近似（照片建模）", none: "没有模型" } as const;

/** 换了模型文件（例如 STEP 换朝上的轴重新转换）：更新大小和长度 */
export function replaceModelFile(id: string, bytes: Buffer, lengthCm: number | null) {
  const m = getProductModelById(id);
  if (!m) throw new Error("模型不存在");
  putFile(modelKey(m), bytes);
  getDb().prepare("UPDATE product_models SET size = ?, length_cm = ? WHERE id = ?").run(bytes.length, lengthCm, id);
}

/** GLB 文件头：magic "glTF" + version 2 */
export const isGlb = (buf: Buffer) => buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "glTF" && buf.readUInt32LE(4) === 2;

const now = () => new Date().toISOString();

/** 白模 / 原模型（审核通过的） */
export function getProductModel(projectId: string): ProductModel | null {
  const r = getDb()
    .prepare("SELECT * FROM product_models WHERE project_id = ? AND color_id IS NULL AND status = 'approved' ORDER BY created_at DESC LIMIT 1")
    .get(projectId) as Row | undefined;
  return r ? toModel(r) : null;
}

/** 颜色款的贴色模型（审核通过的） */
export function getColorModel(projectId: string, colorId: string): ProductModel | null {
  const r = getDb()
    .prepare("SELECT * FROM product_models WHERE project_id = ? AND color_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1")
    .get(projectId, colorId) as Row | undefined;
  return r ? toModel(r) : null;
}

/** 视频要用的模型：选了颜色款且已贴好色就用颜色款，否则用原模型 */
export function modelFor(projectId: string, colorId?: string | null): ProductModel | null {
  return (colorId ? getColorModel(projectId, colorId) : null) ?? getProductModel(projectId);
}

export function listProductModels(projectId: string): ProductModel[] {
  return (getDb().prepare("SELECT * FROM product_models WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Row[]).map(toModel);
}

export function getProductModelById(id: string): ProductModel | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM product_models WHERE id = ?").get(id) as Row | undefined;
  return r ? toModel(r) : null;
}

/** 同一个范围（白模 / 某个颜色款）只保留一个在用的，旧的归档不删文件 */
function archiveOthers(m: ProductModel) {
  getDb()
    .prepare("UPDATE product_models SET status = 'archived' WHERE project_id = ? AND id != ? AND status = 'approved' AND color_id IS ?")
    .run(m.projectId, m.id, m.colorId);
  // 原模型换了：旧模型渲染的参考图作废
  removePrefix(refsKey(m.projectId, m.colorId));
}

export function addProductModel(input: {
  projectId: string;
  originalName: string;
  bytes: Buffer;
  status?: ModelStatus;
  colorId?: string | null;
  source?: ProductModel["source"];
  remoteUrl?: string | null;
  lengthCm?: number | null;
}): ProductModel {
  const id = randomUUID();
  const fileName = `${id}.glb`;
  putFile(storageKey(input.projectId, "models", fileName), input.bytes);
  getDb()
    .prepare(
      "INSERT INTO product_models (id, project_id, original_name, file_name, size, created_at, status, color_id, source, remote_url, length_cm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.projectId, input.originalName.slice(0, 200), fileName, input.bytes.length, now(), input.status ?? "approved", input.colorId ?? null, input.source ?? "upload", input.remoteUrl ?? null, input.lengthCm ?? null);
  const m = getProductModelById(id)!;
  if (m.status === "approved") archiveOthers(m);
  return m;
}

export function reviewProductModel(id: string, ok: boolean, opts: { lengthCm?: number | null; note?: string }): ProductModel {
  const m = getProductModelById(id);
  if (!m) throw new Error("模型不存在");
  if (m.status !== "review") throw new Error("这个模型已经审核过了");
  getDb()
    .prepare("UPDATE product_models SET status = ?, length_cm = ?, note = ? WHERE id = ?")
    .run(ok ? "approved" : "rejected", opts.lengthCm ?? null, (opts.note ?? "").slice(0, 500), id);
  const next = getProductModelById(id)!;
  if (ok) archiveOthers(next);
  return next;
}

export function deleteProductModel(id: string): boolean {
  const m = getProductModelById(id);
  if (!m) return false;
  getDb().prepare("DELETE FROM product_models WHERE id = ?").run(id);
  removeFile(modelKey(m));
  if (m.source === "step") removeFile(stepKey(m));
  if (m.status === "approved") removePrefix(m.colorId ? refsKey(m.projectId, m.colorId) : storageKey(m.projectId, "cad"));
  return true;
}

// ---------- 颜色款 ----------

export interface ProductColor {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export function listColors(projectId: string): ProductColor[] {
  return (getDb().prepare("SELECT * FROM product_colors WHERE project_id = ? ORDER BY created_at").all(projectId) as { id: string; project_id: string; name: string; created_at: string }[]).map(
    (r) => ({ id: r.id, projectId: r.project_id, name: r.name, createdAt: r.created_at }),
  );
}

export function getColor(id: string): ProductColor | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM product_colors WHERE id = ?").get(id) as { id: string; project_id: string; name: string; created_at: string } | undefined;
  return r ? { id: r.id, projectId: r.project_id, name: r.name, createdAt: r.created_at } : null;
}

export function addColor(projectId: string, name: string): ProductColor {
  const n = name.trim().slice(0, 30);
  if (!n) throw new Error("请填写颜色名称");
  if (listColors(projectId).some((c) => c.name === n)) throw new Error(`已经有「${n}」这个颜色款`);
  const id = randomUUID();
  getDb().prepare("INSERT INTO product_colors (id, project_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, projectId, n, now());
  return getColor(id)!;
}

// ---------- 建模任务（fal） ----------

export type ModelJobStatus = "submitting" | "submitted" | "done" | "failed" | "unknown";

export interface ModelJob {
  id: string;
  projectId: string;
  target: "shape" | "color";
  colorId: string | null;
  provider: string;
  endpoint: string;
  estUsd: number;
  status: ModelJobStatus;
  requestId: string | null;
  statusUrl: string | null;
  responseUrl: string | null;
  modelId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobRow {
  id: string;
  project_id: string;
  target: string;
  color_id: string | null;
  provider: string;
  endpoint: string;
  est_usd: number;
  status: string;
  request_id: string | null;
  status_url: string | null;
  response_url: string | null;
  model_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const toJob = (r: JobRow): ModelJob => ({
  id: r.id,
  projectId: r.project_id,
  target: r.target === "color" ? "color" : "shape",
  colorId: r.color_id,
  provider: r.provider,
  endpoint: r.endpoint,
  estUsd: r.est_usd,
  status: r.status as ModelJobStatus,
  requestId: r.request_id,
  statusUrl: r.status_url,
  responseUrl: r.response_url,
  modelId: r.model_id,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listModelJobs(projectId: string): ModelJob[] {
  return (getDb().prepare("SELECT * FROM model_jobs WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as JobRow[]).map(toJob);
}

export function getModelJob(id: string): ModelJob | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM model_jobs WHERE id = ?").get(id) as JobRow | undefined;
  return r ? toJob(r) : null;
}

/** 同一个目标（白模 / 某个颜色款）还在进行或状态不明的任务：有就不许再提交，避免重复扣费 */
export function openModelJob(projectId: string, colorId: string | null): ModelJob | null {
  return listModelJobs(projectId).find((j) => j.colorId === colorId && (j.status === "submitting" || j.status === "submitted" || j.status === "unknown")) ?? null;
}

export function addModelJob(j: Pick<ModelJob, "projectId" | "target" | "colorId" | "provider" | "endpoint" | "estUsd">): ModelJob {
  const id = randomUUID();
  const t = now();
  getDb()
    .prepare("INSERT INTO model_jobs (id, project_id, target, color_id, provider, endpoint, est_usd, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitting', ?, ?)")
    .run(id, j.projectId, j.target, j.colorId, j.provider, j.endpoint, j.estUsd, t, t);
  return getModelJob(id)!;
}

export function updateModelJob(id: string, p: Partial<Pick<ModelJob, "status" | "requestId" | "statusUrl" | "responseUrl" | "modelId" | "error">>) {
  const cols: [keyof typeof p, string][] = [
    ["status", "status"],
    ["requestId", "request_id"],
    ["statusUrl", "status_url"],
    ["responseUrl", "response_url"],
    ["modelId", "model_id"],
    ["error", "error"],
  ];
  const sets = ["updated_at = ?"];
  const vals: unknown[] = [now()];
  for (const [k, c] of cols) {
    if (p[k] !== undefined) {
      sets.push(`${c} = ?`);
      vals.push(p[k]);
    }
  }
  getDb().prepare(`UPDATE model_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
}
