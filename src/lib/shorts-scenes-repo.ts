// 短视频场地库的本机存储：按产品项目保存，多条短视频共用；每次修改存成新版本。
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { boxItem, cleanItems, newItem, presetScenes, sceneBounds, themeDecor, type Scene, type SceneItem, type SceneVersion } from "@/lib/shorts-scenes";
import { SET_ROOMS } from "@/lib/shorts-set";
import type { ShortVideo } from "@/lib/shorts";

const now = () => new Date().toISOString();
let ready = false;

function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS short_scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS short_scenes_project ON short_scenes(project_id, created_at);`);
    ready = true;
  }
  return d;
}

type Row = { id: string; project_id: string; data: string; updated_at: string };
const toScene = (r: Row): Scene => ({ ...(JSON.parse(r.data) as Omit<Scene, "id" | "projectId" | "updatedAt">), id: r.id, projectId: r.project_id, updatedAt: r.updated_at });

export function listScenes(projectId: string): Scene[] {
  return (db().prepare("SELECT * FROM short_scenes WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as Row[]).map(toScene);
}

export function getScene(id: string): Scene | null {
  const r = db().prepare("SELECT * FROM short_scenes WHERE id = ?").get(id) as Row | undefined;
  return r ? toScene(r) : null;
}

export function saveScene(s: Scene) {
  const { id, projectId, updatedAt: _u, ...data } = s;
  void _u;
  db().prepare("UPDATE short_scenes SET data = ?, updated_at = ? WHERE id = ? AND project_id = ?").run(JSON.stringify(data), now(), id, projectId);
}

export function createScene(projectId: string, init: { name: string; description: string; special?: string; outdoor: boolean; items: SceneItem[]; note?: string }, extra: SceneVersion[] = []): Scene {
  const id = randomUUID();
  const t = now();
  const versions: SceneVersion[] = [{ v: 1, items: cleanItems(init.items), refJobId: null, note: init.note ?? "新建", createdAt: t }, ...extra];
  const data = { name: init.name.slice(0, 40), description: init.description.slice(0, 400), special: (init.special ?? "").slice(0, 600), outdoor: init.outdoor, versions };
  db().prepare("INSERT INTO short_scenes (id, project_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, projectId, JSON.stringify(data), t, t);
  return getScene(id)!;
}

/** 存成新版本（旧版本保留，已锁定的镜头继续用旧版） */
export function addVersion(s: Scene, items: SceneItem[], note: string): SceneVersion {
  const last = s.versions[s.versions.length - 1];
  const ver: SceneVersion = { v: last.v + 1, items: cleanItems(items), refJobId: last.refJobId, refFromV: last.refJobId ? (last.refFromV ?? last.v) : undefined, note: note.slice(0, 200), createdAt: now() };
  s.versions.push(ver);
  saveScene(s);
  return ver;
}

export const latest = (s: Scene) => s.versions[s.versions.length - 1];
export const versionOf = (s: Scene, v: number) => s.versions.find((x) => x.v === v) ?? latest(s);

/**
 * 第一次打开场地库：放入起始场地；旧视频（整条一个 room 预设）迁移成「场地 + 版本 + 主题」，
 * 旧灰盒原样存成 v1，已确认 / 已采用的镜头绑定 v1，画面和 3D 构图对得上。
 */
export function ensureScenes(projectId: string, videos: ShortVideo[]): Scene[] {
  let scenes = listScenes(projectId);
  if (!scenes.length) {
    const legacy = new Set(videos.filter((v) => v.shots.some((s) => !s.scene)).map((v) => (v.room === "xmas-living" ? "living" : v.room)));
    for (const p of presetScenes()) {
      const old = SET_ROOMS.find((r) => r.label === p.name || (p.name.startsWith("车道") && r.id === "driveway") || (p.name.startsWith("公园") && r.id === "park"));
      if (old && legacy.has(old.id)) {
        // v1 = 旧灰盒（圣诞树和礼物拆进圣诞主题层），v2 = 有形状的家具
        const xmas = SET_ROOMS.find((r) => r.id === "xmas-living")!;
        const boxes = old.id === "living" ? [...xmas.props.slice(0, 6).map((b) => boxItem(b)), ...xmas.props.slice(6).map((b) => boxItem(b, "box", "christmas"))] : old.props.map((b) => boxItem(b));
        const v2items = [...p.items, ...themeDecor("christmas", p.items, p.outdoor)];
        createScene(projectId, { ...p, items: boxes, note: "旧版灰盒（迁移）" }, [{ v: 2, items: cleanItems(v2items), refJobId: null, note: "升级为有形状的家具", createdAt: now() }]);
      } else {
        createScene(projectId, { ...p, items: [...p.items, ...themeDecor("christmas", p.items, p.outdoor)] });
      }
    }
    scenes = listScenes(projectId);
  }
  // 早期预设室内只有三面墙（南面空着）：机位朝南时会拍到房外。没被镜头用过的预设版本补上南墙
  const used = new Set<string>();
  for (const v of videos)
    for (const s of v.shots) {
      const sh = s.scene ?? legacyShotScene(scenes, v.room);
      used.add(`${sh.id}:${sh.v}`);
    }
  for (const sc of scenes) {
    if (sc.outdoor) continue;
    let changed = false;
    for (const ver of sc.versions) {
      const ws = ver.items.filter((i) => i.type === "wall");
      if (used.has(`${sc.id}:${ver.v}`) || ws.length !== 3 || !(ver.note === "升级为有形状的家具" || ver.note === "新建")) continue;
      const b = sceneBounds(ver.items);
      ver.items.push({ ...newItem("wall", (b.x0 + b.x1) / 2, b.y0 - 0.05), w: b.x1 - b.x0, rgb: [...ws[0].rgb] });
      changed = true;
    }
    if (changed) saveScene(sc);
  }
  return scenes;
}

/** 旧视频的镜头没有绑定场地：按旧 room 预设绑定到迁移来的 v1 */
export function legacyShotScene(scenes: Scene[], room: string): { id: string; v: number; theme: string } {
  const label = room === "xmas-living" || room === "living" ? "客厅" : room === "kids-room" ? "儿童房" : room === "driveway" ? "车道 / 前院" : "公园小路";
  const s = scenes.find((x) => x.name === label) ?? scenes[0];
  return { id: s.id, v: s.versions[0].v, theme: room === "xmas-living" ? "christmas" : "none" };
}
