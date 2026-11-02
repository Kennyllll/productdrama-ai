// 模型设置（仅服务端）：API Key 只保存在本机 SQLite（data/ 已 gitignore），不会发送到前端。
import { getDb } from "@/lib/db";
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel, type AiPublicInfo } from "@/lib/ai/models";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export interface AiSettings {
  baseUrl: string;
  model: AiModel;
  apiKey: string;
}

export function getAiSettings(): AiSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'ai'").get() as { value: string } | undefined;
  let o: Record<string, unknown> = {};
  try {
    o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  } catch {
    o = {};
  }
  const model = AI_MODELS.includes(o.model as AiModel) ? (o.model as AiModel) : DEFAULT_AI_MODEL;
  return { baseUrl: DEEPSEEK_BASE_URL, model, apiKey: typeof o.apiKey === "string" ? o.apiKey : "" };
}

export function saveAiSettings(s: { model: AiModel; apiKey: string }) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ provider: "deepseek", model: s.model, apiKey: s.apiKey }));
}

export function aiPublicInfo(): AiPublicInfo {
  const s = getAiSettings();
  return { configured: s.apiKey !== "", model: s.model, keyHint: s.apiKey ? `••••${s.apiKey.slice(-4)}` : "" };
}
