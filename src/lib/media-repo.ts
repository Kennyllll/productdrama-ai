// 镜头素材（TASK-008）：每个镜头最多 1 个视频或图片，文件保存在 uploads/<projectId>/shots/。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";

export const MAX_MEDIA_BYTES = 300 * 1024 * 1024;
export const SHOT_ID_RE = /^[a-z0-9-]{4,40}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type MediaKind = "image" | "video";

export interface ShotMedia {
  id: string;
  projectId: string;
  shotId: string;
  kind: MediaKind;
  fileName: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

/** 前端可见的素材信息（不含文件路径） */
export type ShotMediaView = Pick<ShotMedia, "id" | "shotId" | "kind" | "originalName" | "size">;
export const toView = (m: ShotMedia): ShotMediaView => ({ id: m.id, shotId: m.shotId, kind: m.kind, originalName: m.originalName, size: m.size });

interface Row {
  id: string;
  project_id: string;
  shot_id: string;
  kind: MediaKind;
  file_name: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: string;
}

const toMedia = (r: Row): ShotMedia => ({
  id: r.id,
  projectId: r.project_id,
  shotId: r.shot_id,
  kind: r.kind,
  fileName: r.file_name,
  originalName: r.original_name,
  mime: r.mime,
  size: r.size,
  createdAt: r.created_at,
});

/** 按文件头识别类型，不信任扩展名 */
export function detectMediaType(buf: Buffer): { kind: MediaKind; mime: string; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png", ext: "png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { kind: "image", mime: "image/webp", ext: "webp" };
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    return buf.subarray(8, 12).toString("ascii") === "qt  " ? { kind: "video", mime: "video/quicktime", ext: "mov" } : { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: "video", mime: "video/webm", ext: "webm" };
  return null;
}

export const mediaPath = (m: ShotMedia) => path.join(UPLOAD_DIR, m.projectId, "shots", m.fileName);

export function listShotMedia(projectId: string): ShotMedia[] {
  return (getDb().prepare("SELECT * FROM shot_media WHERE project_id = ? ORDER BY created_at").all(projectId) as Row[]).map(toMedia);
}

export function getShotMedia(id: string): ShotMedia | null {
  if (!ID_RE.test(id)) return null;
  const row = getDb().prepare("SELECT * FROM shot_media WHERE id = ?").get(id) as Row | undefined;
  return row ? toMedia(row) : null;
}

export function deleteShotMedia(id: string): boolean {
  const m = getShotMedia(id);
  if (!m) return false;
  getDb().prepare("DELETE FROM shot_media WHERE id = ?").run(id);
  fs.rmSync(mediaPath(m), { force: true });
  return true;
}

export function setShotMedia(input: { projectId: string; shotId: string; originalName: string; bytes: Buffer; kind: MediaKind; mime: string; ext: string }): ShotMedia {
  for (const old of listShotMedia(input.projectId).filter((m) => m.shotId === input.shotId)) deleteShotMedia(old.id);
  const id = randomUUID();
  const fileName = `${id}.${input.ext}`;
  const dir = path.join(UPLOAD_DIR, input.projectId, "shots");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.bytes);
  getDb()
    .prepare(
      "INSERT INTO shot_media (id, project_id, shot_id, kind, file_name, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.projectId, input.shotId, input.kind, fileName, input.originalName, input.mime, input.bytes.length, new Date().toISOString());
  return getShotMedia(id)!;
}
