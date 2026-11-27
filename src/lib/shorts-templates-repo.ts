// 短视频模板：做好的视频存成模板，所有产品都能套用。只存文字、机位、场地内容和节日；不存首帧、视频、花费和颜色款。
import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { SceneItem } from "@/lib/shorts-scenes";
import type { TemplateCastMember } from "@/lib/template-retarget";
import type { ShortShot, VideoResolution } from "@/lib/shorts";

export interface TemplateScene {
  key: string;
  name: string;
  description: string;
  special: string;
  outdoor: boolean;
  /** 不含节日装饰层：套用时按选的节日重新摆 */
  items: SceneItem[];
}

export type TemplateShot = Pick<
  ShortShot,
  "beat" | "useSeconds" | "trimStart" | "genSeconds" | "description" | "camera" | "caption" | "productNote" | "compositeNote" | "operator" | "framePrompt" | "motionPrompt" | "layout" | "family" | "special" | "hook"
> & { sceneKey: string | null };

export interface ShortTemplateData {
  name: string;
  /** 每改一次 +1；套用时整份复制，已经做的视频不受影响 */
  v: number;
  /** 内置模板（风格、开箱要包装照等规则） */
  baseTemplateId: string;
  theme: string;
  themeText?: string;
  resolution: VideoResolution;
  room: string;
  /** 原来是哪个产品做的（提醒换产品要改文字） */
  fromProduct: string;
  /** 原产品类型（balance / tricycle / other）：换类型时改写动作 */
  fromKind?: string;
  /** 原产品握把高度（米）：套到别的产品时按它缩放摄影机和人偶距离 */
  gripY: number;
  /** 原来绑定的家庭成员（套到别的家庭时按角色换名字） */
  cast?: TemplateCastMember[];
  scenes: TemplateScene[];
  shots: TemplateShot[];
}

export interface ShortTemplate extends ShortTemplateData {
  id: string;
  updatedAt: string;
}

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec("CREATE TABLE IF NOT EXISTS short_templates (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    ready = true;
  }
  return d;
}

type Row = { id: string; data: string; updated_at: string };
const toTemplate = (r: Row): ShortTemplate => ({ ...(JSON.parse(r.data) as ShortTemplateData), id: r.id, updatedAt: r.updated_at });

export function listTemplates(): ShortTemplate[] {
  return (db().prepare("SELECT id, data, updated_at FROM short_templates ORDER BY updated_at DESC").all() as Row[]).map(toTemplate);
}

export function getTemplate(id: string): ShortTemplate | null {
  const r = db().prepare("SELECT id, data, updated_at FROM short_templates WHERE id = ?").get(id) as Row | undefined;
  return r ? toTemplate(r) : null;
}

export function createTemplate(data: ShortTemplateData): string {
  const id = randomUUID();
  const t = new Date().toISOString();
  db().prepare("INSERT INTO short_templates (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(data), t, t);
  return id;
}

export function saveTemplate(tp: ShortTemplate) {
  const { id, updatedAt: _u, ...data } = tp;
  void _u;
  db().prepare("UPDATE short_templates SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), new Date().toISOString(), id);
}

export function deleteTemplate(id: string) {
  db().prepare("DELETE FROM short_templates WHERE id = ?").run(id);
}
