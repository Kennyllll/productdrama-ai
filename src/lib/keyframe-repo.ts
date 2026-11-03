// 关键帧候选（TASK-012）：文件保存在 uploads/<projectId>/keyframes/，选定的关键帧同步为视频页镜头素材。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";
import { detectMediaType, listShotMedia, setShotMedia } from "@/lib/media-repo";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface Keyframe {
  id: string;
  projectId: string;
  shotId: string;
  fileName: string;
  mime: string;
  model: string;
  prompt: string;
  usd: number;
  selected: boolean;
  createdAt: string;
}

export type KeyframeView = Pick<Keyframe, "id" | "shotId" | "model" | "usd" | "selected" | "createdAt">;
export const toKeyframeView = (k: Keyframe): KeyframeView => ({ id: k.id, shotId: k.shotId, model: k.model, usd: k.usd, selected: k.selected, createdAt: k.createdAt });

interface Row {
  id: string;
  project_id: string;
  shot_id: string;
  file_name: string;
  mime: string;
  model: string;
  prompt: string;
  usd: number;
  selected: number;
  created_at: string;
}

const toKf = (r: Row): Keyframe => ({
  id: r.id,
  projectId: r.project_id,
  shotId: r.shot_id,
  fileName: r.file_name,
  mime: r.mime,
  model: r.model,
  prompt: r.prompt,
  usd: r.usd,
  selected: r.selected === 1,
  createdAt: r.created_at,
});

export const keyframePath = (k: Keyframe) => path.join(UPLOAD_DIR, k.projectId, "keyframes", k.fileName);

export function listKeyframes(projectId: string): Keyframe[] {
  return (getDb().prepare("SELECT * FROM keyframes WHERE project_id = ? ORDER BY created_at").all(projectId) as Row[]).map(toKf);
}

export function getKeyframe(id: string): Keyframe | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM keyframes WHERE id = ?").get(id) as Row | undefined;
  return r ? toKf(r) : null;
}

export function addKeyframe(input: { projectId: string; shotId: string; bytes: Buffer; model: string; prompt: string; usd: number }): Keyframe | null {
  const type = detectMediaType(input.bytes);
  if (!type || type.kind !== "image") return null;
  const id = randomUUID();
  const fileName = `${id}.${type.ext}`;
  const dir = path.join(UPLOAD_DIR, input.projectId, "keyframes");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.bytes);
  getDb()
    .prepare("INSERT INTO keyframes (id, project_id, shot_id, file_name, mime, model, prompt, usd, selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)")
    .run(id, input.projectId, input.shotId, fileName, type.mime, input.model, input.prompt.slice(0, 6000), input.usd, new Date().toISOString());
  return getKeyframe(id);
}

/** 选定关键帧：同镜头其他候选取消选定，并把图片写入视频页镜头素材 */
export function selectKeyframe(id: string): Keyframe | null {
  const k = getKeyframe(id);
  if (!k) return null;
  const db = getDb();
  db.prepare("UPDATE keyframes SET selected = 0 WHERE project_id = ? AND shot_id = ?").run(k.projectId, k.shotId);
  db.prepare("UPDATE keyframes SET selected = 1 WHERE id = ?").run(id);
  const bytes = fs.readFileSync(keyframePath(k));
  const type = detectMediaType(bytes);
  if (type) setShotMedia({ projectId: k.projectId, shotId: k.shotId, originalName: `关键帧-${k.model}.${type.ext}`, bytes, ...type });
  return getKeyframe(id);
}

export function deleteKeyframe(id: string): boolean {
  const k = getKeyframe(id);
  if (!k) return false;
  getDb().prepare("DELETE FROM keyframes WHERE id = ?").run(id);
  fs.rmSync(keyframePath(k), { force: true });
  return true;
}

export const shotHasMedia = (projectId: string, shotId: string) => listShotMedia(projectId).some((m) => m.shotId === shotId);
