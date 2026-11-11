// 制作工具数据：镜头卡、素材库、费用账本、规则库、决定记录、向导对话、时间线、3D 布景（本地 SQLite）。仅在服务端使用。
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDb, UPLOAD_DIR } from "@/lib/db";

const ID_RE = /^[0-9a-f-]{36}$/;

export type ShotStatus = "final" | "cut" | "rejected";

export interface ShotIssue {
  title: string;
  fix: string;
}

export interface ShotPrompt {
  label: string;
  text: string;
}

export interface ShotCardData {
  title: string;
  purpose: string;
  status: ShotStatus;
  camera: string;
  /** 在定稿时间线上的位置（秒），以及用的是素材的哪一段 */
  inFinal?: { start: number; end: number; srcIn: number; srcOut: number };
  issues: ShotIssue[];
  prompts: ShotPrompt[];
  note?: string;
}

export interface ShotCard extends ShotCardData {
  id: string;
  episode: number;
  code: string;
  sort: number;
}

export type LibraryKind = "comp" | "first_frame" | "last_frame" | "video" | "check" | "audio" | "final";

export interface LibraryFile {
  id: string;
  episode: number;
  shotCode: string;
  kind: LibraryKind;
  label: string;
  mime: string;
  size: number;
  status: "" | "final" | "rejected";
}

export interface LedgerEntry {
  id: string;
  episode: number;
  shotCode: string;
  /** first_frame | video | video_edit | sound | usage_day */
  kind: string;
  model: string;
  usd: number;
  exact: boolean;
  used: boolean;
  note: string;
  createdAt: string;
}

export type RuleLayer = "product" | "character" | "scene" | "edit" | "process";

export interface Rule {
  id: string;
  scope: string;
  layer: RuleLayer;
  level: "must" | "warn";
  text: string;
  source: string;
  origin: string;
}

export interface Decision {
  id: string;
  text: string;
  context: string;
  origin: string;
  createdAt: string;
}

export interface GuideMessage {
  id: string;
  role: "user" | "guide";
  context: string;
  text: string;
  origin: string;
  createdAt: string;
}

export interface TimelineCut {
  code: string;
  start: number;
  end: number;
}

export interface TimelineLine {
  start: number;
  end: number;
  kind: string;
  text: string;
}

export interface TimelineCue {
  layer: "dialogue" | "music" | "ambience" | "sfx";
  label: string;
  start: number;
  end: number;
}

export interface TimelineData {
  version: string;
  total: number;
  fps: number;
  cuts: TimelineCut[];
  lines: TimelineLine[];
  cues: TimelineCue[];
  deliverables: { label: string; fileId: string }[];
  notes: string[];
}

export interface SetProp {
  lo: [number, number, number];
  hi: [number, number, number];
  rgb: [number, number, number];
}

/** 一个镜头的 3D 布景（坐标沿用 Blender：x 东、y 北、z 上，单位米） */
export interface SetLayout {
  lens: number;
  camPos: [number, number, number];
  lookAt: [number, number, number];
  bike?: [number, number];
  bikeYaw?: number;
  figure?: boolean;
  aspect: number;
  source: string;
  /** 这个镜头当时 Blender 构图用的布景方块（只读） */
  props?: SetProp[];
}

export interface SetLayoutRecord {
  code: string;
  original: SetLayout;
  edited: SetLayout | null;
  updatedAt: string;
}

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function listShotCards(projectId: string, episode: number): ShotCard[] {
  const rows = getDb()
    .prepare("SELECT id, episode, code, sort, data FROM shot_cards WHERE project_id = ? AND episode = ? ORDER BY sort")
    .all(projectId, episode) as { id: string; episode: number; code: string; sort: number; data: string }[];
  return rows.map((r) => ({ ...parse<ShotCardData>(r.data, { title: r.code, purpose: "", status: "cut", camera: "", issues: [], prompts: [] }), id: r.id, episode: r.episode, code: r.code, sort: r.sort }));
}

export function listEpisodesWithCards(projectId: string): number[] {
  return (getDb().prepare("SELECT DISTINCT episode FROM shot_cards WHERE project_id = ? ORDER BY episode").all(projectId) as { episode: number }[]).map((r) => r.episode);
}

type FileRow = { id: string; project_id: string; episode: number; shot_code: string; kind: LibraryKind; label: string; rel_path: string; mime: string; size: number; status: LibraryFile["status"] };
const toFile = (r: FileRow): LibraryFile => ({ id: r.id, episode: r.episode, shotCode: r.shot_code, kind: r.kind, label: r.label, mime: r.mime, size: r.size, status: r.status });

export function listLibrary(projectId: string, episode: number): LibraryFile[] {
  return (getDb().prepare("SELECT * FROM library_files WHERE project_id = ? AND episode = ? ORDER BY created_at, rowid").all(projectId, episode) as FileRow[]).map(toFile);
}

export function libraryFilePath(id: string): { filePath: string; mime: string } | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare("SELECT * FROM library_files WHERE id = ?").get(id) as FileRow | undefined;
  if (!r) return null;
  const base = path.join(UPLOAD_DIR, r.project_id);
  const filePath = path.resolve(base, r.rel_path);
  if (!filePath.startsWith(base + path.sep)) return null;
  return { filePath, mime: r.mime };
}

export function listLedger(projectId: string): LedgerEntry[] {
  const rows = getDb().prepare("SELECT * FROM ledger WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as {
    id: string; episode: number; shot_code: string; kind: string; model: string; usd: number; exact: number; used: number; note: string; created_at: string;
  }[];
  return rows.map((r) => ({ id: r.id, episode: r.episode, shotCode: r.shot_code, kind: r.kind, model: r.model, usd: r.usd, exact: r.exact === 1, used: r.used === 1, note: r.note, createdAt: r.created_at }));
}

export function listRules(projectId: string): Rule[] {
  return getDb().prepare("SELECT id, scope, layer, level, text, source, origin FROM rules WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as Rule[];
}

export function addRule(projectId: string, input: { layer: RuleLayer; level: "must" | "warn"; text: string; source: string }): void {
  getDb()
    .prepare("INSERT INTO rules (id, project_id, scope, layer, level, text, source, origin, created_at) VALUES (?, ?, 'project', ?, ?, ?, ?, 'user', ?)")
    .run(randomUUID(), projectId, input.layer, input.level, input.text, input.source, new Date().toISOString());
}

export function deleteRule(projectId: string, id: string): void {
  getDb().prepare("DELETE FROM rules WHERE project_id = ? AND id = ?").run(projectId, id);
}

export function listDecisions(projectId: string): Decision[] {
  return (getDb().prepare("SELECT id, text, context, origin, created_at FROM decisions WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as (Omit<Decision, "createdAt"> & { created_at: string })[]).map(
    ({ created_at, ...d }) => ({ ...d, createdAt: created_at }),
  );
}

export function addDecision(projectId: string, text: string, context: string): void {
  getDb().prepare("INSERT INTO decisions (id, project_id, text, context, origin, created_at) VALUES (?, ?, ?, ?, 'user', ?)").run(randomUUID(), projectId, text, context, new Date().toISOString());
}

export function listGuideMessages(projectId: string): GuideMessage[] {
  return (getDb().prepare("SELECT id, role, context, text, origin, created_at FROM guide_messages WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as (Omit<GuideMessage, "createdAt"> & { created_at: string })[]).map(
    ({ created_at, ...m }) => ({ ...m, createdAt: created_at }),
  );
}

export function addGuideMessage(projectId: string, role: GuideMessage["role"], text: string, context: string): GuideMessage {
  const m = { id: randomUUID(), role, context, text, origin: "user", createdAt: new Date().toISOString() };
  getDb().prepare("INSERT INTO guide_messages (id, project_id, role, context, text, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(m.id, projectId, role, context, text, m.origin, m.createdAt);
  return m;
}

export function getTimeline(projectId: string, episode: number): TimelineData | null {
  const r = getDb().prepare("SELECT data FROM timelines WHERE project_id = ? AND episode = ?").get(projectId, episode) as { data: string } | undefined;
  return r ? parse<TimelineData | null>(r.data, null) : null;
}

export function listSetLayouts(projectId: string, episode: number): SetLayoutRecord[] {
  const rows = getDb().prepare("SELECT shot_code, data, edited, updated_at FROM set_layouts WHERE project_id = ? AND episode = ? AND shot_code != '_map'").all(projectId, episode) as {
    shot_code: string; data: string; edited: string | null; updated_at: string;
  }[];
  return rows.map((r) => ({ code: r.shot_code, original: parse<SetLayout>(r.data, {} as SetLayout), edited: parse<SetLayout | null>(r.edited, null), updatedAt: r.updated_at }));
}

export function getSetMap(projectId: string, episode: number): SetProp[] {
  const r = getDb().prepare("SELECT data FROM set_layouts WHERE project_id = ? AND episode = ? AND shot_code = '_map'").get(projectId, episode) as { data: string } | undefined;
  return parse<SetProp[]>(r?.data, []);
}

export function saveSetLayout(projectId: string, episode: number, code: string, edited: SetLayout | null): boolean {
  const res = getDb()
    .prepare("UPDATE set_layouts SET edited = ?, updated_at = ? WHERE project_id = ? AND episode = ? AND shot_code = ? AND shot_code != '_map'")
    .run(edited ? JSON.stringify(edited) : null, new Date().toISOString(), projectId, episode, code);
  return res.changes > 0;
}
