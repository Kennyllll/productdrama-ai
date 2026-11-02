// 声音设计与分轨的本地存储（TASK-010a）。分轨文件保存在 uploads/<projectId>/stems/。
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";
import { sanitizeSoundPlan } from "@/lib/sound";
import type { EpisodeNumber, SoundPlan, SoundStem, StemLayer } from "@/lib/types";

export const MAX_STEM_BYTES = 200 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function getSoundPlan(projectId: string): SoundPlan | null {
  const row = getDb().prepare("SELECT data FROM sound_plans WHERE project_id = ?").get(projectId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return sanitizeSoundPlan(JSON.parse(row.data));
  } catch {
    return null;
  }
}

export function saveSoundPlan(projectId: string, plan: SoundPlan) {
  const db = getDb();
  db.prepare("INSERT INTO sound_plans (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data").run(projectId, JSON.stringify(plan));
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId);
}

/** 按文件头识别音频类型，不信任扩展名 */
export function detectAudioType(buf: Buffer): { mime: string; ext: string } | null {
  const ascii = (a: number, b: number) => buf.subarray(a, b).toString("ascii");
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (buf.length >= 12 && ascii(0, 4) === "FORM" && (ascii(8, 12) === "AIFF" || ascii(8, 12) === "AIFC")) return { mime: "audio/aiff", ext: "aiff" };
  if (buf.length >= 4 && ascii(0, 4) === "fLaC") return { mime: "audio/flac", ext: "flac" };
  if (buf.length >= 12 && ascii(4, 8) === "ftyp" && ["M4A ", "M4B ", "mp42", "isom"].includes(ascii(8, 12))) return { mime: "audio/mp4", ext: "m4a" };
  if (buf.length >= 3 && ascii(0, 3) === "ID3") return { mime: "audio/mpeg", ext: "mp3" };
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3" };
  return null;
}

interface Row {
  id: string;
  project_id: string;
  episode: number;
  layer: StemLayer;
  file_name: string;
  original_name: string;
  mime: string;
  size: number;
  volume_db: number;
  created_at: string;
}

const toStem = (r: Row): SoundStem => ({
  id: r.id,
  projectId: r.project_id,
  episode: r.episode as EpisodeNumber,
  layer: r.layer,
  fileName: r.file_name,
  originalName: r.original_name,
  mime: r.mime,
  size: r.size,
  volumeDb: r.volume_db,
  createdAt: r.created_at,
});

export type StemView = Pick<SoundStem, "id" | "episode" | "layer" | "originalName" | "size" | "volumeDb">;
export const toStemView = (s: SoundStem): StemView => ({ id: s.id, episode: s.episode, layer: s.layer, originalName: s.originalName, size: s.size, volumeDb: s.volumeDb });

export const stemPath = (s: SoundStem) => path.join(UPLOAD_DIR, s.projectId, "stems", s.fileName);

export function listStems(projectId: string): SoundStem[] {
  return (getDb().prepare("SELECT * FROM sound_stems WHERE project_id = ? ORDER BY episode, layer").all(projectId) as Row[]).map(toStem);
}

export function getStem(id: string): SoundStem | null {
  if (!ID_RE.test(id)) return null;
  const row = getDb().prepare("SELECT * FROM sound_stems WHERE id = ?").get(id) as Row | undefined;
  return row ? toStem(row) : null;
}

export function deleteStem(id: string): boolean {
  const s = getStem(id);
  if (!s) return false;
  getDb().prepare("DELETE FROM sound_stems WHERE id = ?").run(id);
  fs.rmSync(stemPath(s), { force: true });
  return true;
}

export function setStemVolume(id: string, volumeDb: number): SoundStem | null {
  const v = Math.max(-30, Math.min(12, Math.round(volumeDb * 2) / 2));
  getDb().prepare("UPDATE sound_stems SET volume_db = ? WHERE id = ?").run(v, id);
  return getStem(id);
}

export function setStem(input: { projectId: string; episode: EpisodeNumber; layer: StemLayer; originalName: string; bytes: Buffer; mime: string; ext: string }): SoundStem {
  for (const old of listStems(input.projectId).filter((s) => s.episode === input.episode && s.layer === input.layer)) deleteStem(old.id);
  const id = randomUUID();
  const fileName = `${id}.${input.ext}`;
  const dir = path.join(UPLOAD_DIR, input.projectId, "stems");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.bytes);
  getDb()
    .prepare(
      "INSERT INTO sound_stems (id, project_id, episode, layer, file_name, original_name, mime, size, volume_db, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
    )
    .run(id, input.projectId, input.episode, input.layer, fileName, input.originalName, input.mime, input.bytes.length, new Date().toISOString());
  return getStem(id)!;
}
