// 本地 SQLite（TASK-002）。仅在服务端使用。
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  selling_points TEXT NOT NULL DEFAULT '[]',
  bible TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('product_photo', 'logo')),
  angle TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_project_kind ON assets(project_id, kind);
CREATE TABLE IF NOT EXISTS product_models (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS creatives (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS easter_eggs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_photos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS egg_photos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES easter_eggs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_eggs (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  egg_id TEXT REFERENCES easter_eggs(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS storyboards (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shot_media (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shot_media_project ON shot_media(project_id);
CREATE TABLE IF NOT EXISTS keyframes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sound_plans (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sound_stems (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  layer TEXT NOT NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  volume_db REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shot_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  code TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shot_cards_project ON shot_cards(project_id, episode, sort);
CREATE TABLE IF NOT EXISTS library_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  shot_code TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  rel_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_files_project ON library_files(project_id, episode, shot_code);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  shot_code TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  usd REAL NOT NULL DEFAULT 0,
  exact INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_project ON ledger(project_id, episode);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'project',
  layer TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'must',
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guide_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS guide_messages_project ON guide_messages(project_id, created_at);
CREATE TABLE IF NOT EXISTS timelines (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (project_id, episode)
);
CREATE TABLE IF NOT EXISTS set_layouts (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  shot_code TEXT NOT NULL,
  data TEXT NOT NULL,
  edited TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, episode, shot_code)
);
`;

const globalForDb = globalThis as unknown as { __productDramaDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__productDramaDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new Database(path.join(DATA_DIR, "productdrama.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    globalForDb.__productDramaDb = db;
  }
  return globalForDb.__productDramaDb;
}
