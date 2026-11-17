// 本地 SQLite（TASK-002）。仅在服务端使用。
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** 白底照 / 车身贴纸 / 颜色款实物照是产品层素材，所有视频共用 */
const ASSET_KINDS = "'product_photo', 'logo', 'packaging_photo', 'white_photo', 'sticker', 'color_photo'";

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
  kind TEXT NOT NULL CHECK (kind IN (${ASSET_KINDS})),
  angle TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  color_id TEXT,
  note TEXT NOT NULL DEFAULT ''
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
CREATE TABLE IF NOT EXISTS product_colors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  color_id TEXT,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  est_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  request_id TEXT,
  status_url TEXT,
  response_url TEXT,
  model_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS model_jobs_project ON model_jobs(project_id, created_at);
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
CREATE TABLE IF NOT EXISTS short_videos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS short_videos_project ON short_videos(project_id, updated_at);
CREATE TABLE IF NOT EXISTS gen_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  shot_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  params TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  seconds REAL NOT NULL DEFAULT 0,
  est_usd REAL NOT NULL DEFAULT 0,
  actual_usd REAL,
  status TEXT NOT NULL,
  request_id TEXT,
  idempotency_key TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  is_test INTEGER NOT NULL DEFAULT 0,
  output_file TEXT,
  output_mime TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gen_jobs_shot ON gen_jobs(video_id, shot_id, kind);
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

const globalForDb = globalThis as unknown as { __productDramaDb?: Database.Database; __productDramaSchema?: string };

/** 旧库的 assets 表 CHECK 里缺新的素材类型：SQLite 改不了 CHECK，只能重建表（先备份数据库） */
function migrateAssetKinds(db: Database.Database) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assets'").get() as { sql: string } | undefined;
  if (!row || row.sql.includes("color_photo")) return;
  db.pragma("wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(path.join(DATA_DIR, "productdrama.db"), path.join(DATA_DIR, `productdrama.db.bak-${Date.now()}`));
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`BEGIN;
CREATE TABLE assets_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (${ASSET_KINDS})),
  angle TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  color_id TEXT,
  note TEXT NOT NULL DEFAULT ''
);
INSERT INTO assets_new (id, project_id, kind, angle, original_name, file_name, mime, size, created_at)
  SELECT id, project_id, kind, angle, original_name, file_name, mime, size, created_at FROM assets;
DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;
CREATE INDEX IF NOT EXISTS assets_project_kind ON assets(project_id, kind);
COMMIT;`);
  } catch (e) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw e;
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function migrate(db: Database.Database) {
  db.exec(SCHEMA);
  migrateAssetKinds(db);
  const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "kind")) db.exec("ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'series'");
  const pcols = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
  if (!pcols.some((c) => c.name === "ride_kind")) db.exec("ALTER TABLE products ADD COLUMN ride_kind TEXT NOT NULL DEFAULT ''");
  // 产品模型：白模（color_id 空）+ 各颜色款的贴色模型；AI 建的先进审核，通过才用
  const mcols = new Set((db.prepare("PRAGMA table_info(product_models)").all() as { name: string }[]).map((c) => c.name));
  const add = (col: string, def: string) => !mcols.has(col) && db.exec(`ALTER TABLE product_models ADD COLUMN ${col} ${def}`);
  add("status", "TEXT NOT NULL DEFAULT 'approved'");
  add("color_id", "TEXT");
  add("source", "TEXT NOT NULL DEFAULT 'upload'");
  add("note", "TEXT NOT NULL DEFAULT ''");
  add("length_cm", "REAL");
  add("remote_url", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS product_models_scope ON product_models(project_id, color_id, status)");
}

export function getDb(): Database.Database {
  if (!globalForDb.__productDramaDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const db = new Database(path.join(DATA_DIR, "productdrama.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    globalForDb.__productDramaDb = db;
  }
  // 开发服务器热更新时连接会被复用，表结构变了也要补上
  if (globalForDb.__productDramaSchema !== SCHEMA) {
    migrate(globalForDb.__productDramaDb);
    globalForDb.__productDramaSchema = SCHEMA;
  }
  return globalForDb.__productDramaDb;
}
