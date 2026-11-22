// 产品短视频与生成任务的本机存储。
import "server-only";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { localPath, putFile, removePrefix, storageKey } from "@/lib/storage";
import { emptyShortData, type GenJob, type JobKind, type JobStatus, type ShortVideo, type ShortVideoData } from "@/lib/shorts";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const now = () => new Date().toISOString();

interface VideoRow {
  id: string;
  project_id: string;
  title: string;
  data: string;
  updated_at: string;
}

function toVideo(r: VideoRow): ShortVideo {
  let data: Partial<ShortVideoData> = {};
  try {
    data = JSON.parse(r.data) as Partial<ShortVideoData>;
  } catch {
    data = {};
  }
  const v: ShortVideo = { ...emptyShortData(), ...data, id: r.id, projectId: r.project_id, title: r.title, updatedAt: r.updated_at };
  // 旧数据：第 1 镜就是开头，标成开头「原版」
  if (!v.hooksReady) {
    if (v.shots.length && !v.shots.some((s) => s.hook)) v.shots = v.shots.map((s, i) => (i === 0 ? { ...s, hook: { name: "原版" } } : s));
    v.hooksReady = true;
  }
  return v;
}

export function listShortVideos(projectId: string): ShortVideo[] {
  if (!ID_RE.test(projectId)) return [];
  return (getDb().prepare("SELECT * FROM short_videos WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC").all(projectId) as VideoRow[]).map(toVideo);
}

export function getShortVideo(id: string): ShortVideo | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM short_videos WHERE id = ? AND deleted_at IS NULL").get(id) as VideoRow | undefined;
  return r ? toVideo(r) : null;
}

/** 在回收站里的也能读（恢复 / 永久删除用） */
export function getShortVideoAny(id: string): ShortVideo | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM short_videos WHERE id = ?").get(id) as VideoRow | undefined;
  return r ? toVideo(r) : null;
}

export function createShortVideo(projectId: string, title: string, templateId: string, theme?: { theme: string; themeText?: string }): string {
  const id = randomUUID();
  const t = now();
  getDb()
    .prepare("INSERT INTO short_videos (id, project_id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, projectId, title, JSON.stringify(emptyShortData(templateId, theme)), t, t);
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(t, projectId);
  return id;
}

export function saveShortVideo(v: ShortVideo) {
  const { id, projectId, title, updatedAt: _u, ...data } = v;
  void _u;
  getDb().prepare("UPDATE short_videos SET title = ?, data = ?, updated_at = ? WHERE id = ? AND project_id = ?").run(title, JSON.stringify(data), now(), id, projectId);
}

/** 删除 = 放进回收站（数据、生成记录、文件都留着，能恢复） */
export function deleteShortVideo(id: string) {
  getDb().prepare("UPDATE short_videos SET deleted_at = ? WHERE id = ?").run(now(), id);
}

export function restoreShortVideo(id: string): boolean {
  return getDb().prepare("UPDATE short_videos SET deleted_at = NULL WHERE id = ?").run(id).changes > 0;
}

/** 永久删除（只在回收站里由管理员确认）：费用账本和操作日志不删 */
export function purgeShortVideo(id: string) {
  const v = getShortVideoAny(id);
  if (!v) return;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM gen_jobs WHERE video_id = ?").run(id);
    db.prepare("DELETE FROM short_videos WHERE id = ?").run(id);
  })();
  removePrefix(storageKey(v.projectId, "shorts", id));
}

export const videoDir = (projectId: string, videoId: string) => localPath(storageKey(projectId, "shorts", videoId));
export const finalPath = (v: { projectId: string; id: string }) => path.join(videoDir(v.projectId, v.id), "final.mp4");
/** 某个开头 + 正文的成片 */
export const hookFinalPath = (v: { projectId: string; id: string }, hookId: string) => path.join(videoDir(v.projectId, v.id), `final-${hookId.replace(/[^a-z0-9-]/g, "")}.mp4`);

interface JobRow {
  id: string;
  project_id: string;
  video_id: string;
  shot_id: string;
  kind: string;
  model: string;
  params: string;
  params_hash: string;
  seconds: number;
  est_usd: number;
  actual_usd: number | null;
  status: string;
  request_id: string | null;
  idempotency_key: string;
  reason: string;
  is_test: number;
  output_file: string | null;
  output_mime: string | null;
  error: string | null;
  created_at: string;
}

export interface JobRecord extends GenJob {
  projectId: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  outputFile: string | null;
  outputMime: string | null;
}

const toJob = (r: JobRow): JobRecord => ({
  id: r.id,
  projectId: r.project_id,
  videoId: r.video_id,
  shotId: r.shot_id,
  kind: r.kind as JobKind,
  model: r.model,
  input: JSON.parse(r.params) as Record<string, unknown>,
  paramsHash: r.params_hash,
  seconds: r.seconds,
  estUsd: r.est_usd,
  actualUsd: r.actual_usd,
  status: r.status as JobStatus,
  requestId: r.request_id,
  idempotencyKey: r.idempotency_key,
  reason: r.reason,
  isTest: r.is_test === 1,
  hasOutput: !!r.output_file,
  outputFile: r.output_file,
  outputMime: r.output_mime,
  error: r.error,
  createdAt: r.created_at,
});

export const toJobView = (j: JobRecord): GenJob => ({
  id: j.id,
  videoId: j.videoId,
  shotId: j.shotId,
  kind: j.kind,
  model: j.model,
  paramsHash: j.paramsHash,
  seconds: j.seconds,
  estUsd: j.estUsd,
  actualUsd: j.actualUsd,
  status: j.status,
  requestId: j.requestId,
  reason: j.reason,
  isTest: j.isTest,
  hasOutput: j.hasOutput,
  error: j.error,
  createdAt: j.createdAt,
});

export function listJobs(videoId: string): JobRecord[] {
  if (!ID_RE.test(videoId)) return [];
  return (getDb().prepare("SELECT * FROM gen_jobs WHERE video_id = ? ORDER BY created_at, rowid").all(videoId) as JobRow[]).map(toJob);
}

export function listProjectJobs(projectId: string): JobRecord[] {
  if (!ID_RE.test(projectId)) return [];
  return (getDb().prepare("SELECT * FROM gen_jobs WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as JobRow[]).map(toJob);
}

export function getJob(id: string): JobRecord | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM gen_jobs WHERE id = ?").get(id) as JobRow | undefined;
  return r ? toJob(r) : null;
}

export function insertJob(j: {
  projectId: string;
  videoId: string;
  shotId: string;
  kind: JobKind;
  model: string;
  input: Record<string, unknown>;
  paramsHash: string;
  seconds: number;
  estUsd: number;
  reason: string;
}): JobRecord {
  const id = randomUUID();
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO gen_jobs (id, project_id, video_id, shot_id, kind, model, params, params_hash, seconds, est_usd, status, idempotency_key, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitting', ?, ?, ?, ?)`,
    )
    .run(id, j.projectId, j.videoId, j.shotId, j.kind, j.model, JSON.stringify(j.input), j.paramsHash, j.seconds, j.estUsd, id, j.reason, t, t);
  return getJob(id)!;
}

export function updateJob(id: string, patch: { status?: JobStatus; requestId?: string; actualUsd?: number; outputFile?: string; outputMime?: string; error?: string | null }) {
  const sets: string[] = ["updated_at = ?"];
  const vals: unknown[] = [now()];
  const map: [keyof typeof patch, string][] = [
    ["status", "status"],
    ["requestId", "request_id"],
    ["actualUsd", "actual_usd"],
    ["outputFile", "output_file"],
    ["outputMime", "output_mime"],
    ["error", "error"],
  ];
  for (const [k, col] of map) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(patch[k]);
    }
  }
  getDb().prepare(`UPDATE gen_jobs SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
}

export const jobFilePath = (j: JobRecord) => (j.outputFile ? path.join(videoDir(j.projectId, j.videoId), j.outputFile) : null);

export function saveJobOutput(j: JobRecord, bytes: Buffer, ext: string, mime: string) {
  const name = `${j.id}.${ext}`;
  putFile(storageKey(j.projectId, "shorts", j.videoId, name), bytes);
  updateJob(j.id, { outputFile: name, outputMime: mime });
}

/** 写入项目费用账本（与长剧共用账本页） */
export function addLedgerEntry(e: { projectId: string; shotCode: string; kind: "first_frame" | "video"; model: string; usd: number; note: string }) {
  getDb()
    .prepare("INSERT INTO ledger (id, project_id, episode, shot_code, kind, model, usd, exact, used, note, created_at) VALUES (?, ?, 0, ?, ?, ?, ?, 1, 0, ?, ?)")
    .run(randomUUID(), e.projectId, e.shotCode, e.kind, e.model, e.usd, e.note, now());
}
