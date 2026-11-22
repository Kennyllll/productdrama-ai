// 成片版本：每次导出成功都另存一份 mp4 + 快照，后面再导出不覆盖
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { videoDir } from "@/lib/shorts-repo";
import type { ExportSnapshot } from "@/lib/spend";

export interface ExportVersion {
  id: string;
  projectId: string;
  videoId: string;
  n: number;
  hookId: string | null;
  file: string;
  snapshot: ExportSnapshot;
  actor: string;
  createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  video_id: string;
  n: number;
  hook_id: string | null;
  file: string;
  snapshot: string;
  actor: string;
  created_at: string;
}
const toVer = (r: Row): ExportVersion => ({ id: r.id, projectId: r.project_id, videoId: r.video_id, n: r.n, hookId: r.hook_id, file: r.file, snapshot: JSON.parse(r.snapshot) as ExportSnapshot, actor: r.actor, createdAt: r.created_at });

export const versionPath = (v: { projectId: string; videoId: string; file: string }) => path.join(videoDir(v.projectId, v.videoId), "exports", v.file);

/** 把刚导出的文件复制成新版本（版本号按这条视频递增） */
export function addExportVersion(e: { projectId: string; videoId: string; hookId: string | null; src: string; snapshot: ExportSnapshot; actor: string }): ExportVersion {
  const d = getDb();
  const n = ((d.prepare("SELECT MAX(n) AS n FROM export_versions WHERE video_id = ?").get(e.videoId) as { n: number | null }).n ?? 0) + 1;
  const id = randomUUID();
  const file = `v${n}-${id.slice(0, 8)}.mp4`;
  const dest = versionPath({ ...e, file });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(e.src, dest);
  d.prepare("INSERT INTO export_versions (id, project_id, video_id, n, hook_id, file, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, e.projectId, e.videoId, n, e.hookId, file, JSON.stringify(e.snapshot), e.actor, new Date().toISOString());
  return toVer(d.prepare("SELECT * FROM export_versions WHERE id = ?").get(id) as Row);
}

export function listExportVersions(videoId: string): ExportVersion[] {
  return (getDb().prepare("SELECT * FROM export_versions WHERE video_id = ? ORDER BY n DESC").all(videoId) as Row[]).map(toVer);
}

export function getExportVersion(id: string): ExportVersion | null {
  const r = getDb().prepare("SELECT * FROM export_versions WHERE id = ?").get(id) as Row | undefined;
  return r ? toVer(r) : null;
}
