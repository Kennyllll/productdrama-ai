// 模型设置（仅服务端）：API Key 只保存在本机 SQLite（data/ 已 gitignore），不会发送到前端。
import { getDb } from "@/lib/db";
import { AI_MODELS, DEFAULT_AI_MODEL, DEFAULT_STORY_MODEL, type AiModel, type AiPublicInfo } from "@/lib/ai/models";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export interface AiSettings {
  baseUrl: string;
  model: AiModel;
  storyModel: AiModel;
  apiKey: string;
}

const pickModel = (v: unknown, fallback: AiModel): AiModel => (AI_MODELS.includes(v as AiModel) ? (v as AiModel) : fallback);

export function getAiSettings(): AiSettings {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'ai'").get() as { value: string } | undefined;
  let o: Record<string, unknown> = {};
  try {
    o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  } catch {
    o = {};
  }
  return {
    baseUrl: DEEPSEEK_BASE_URL,
    model: pickModel(o.model, DEFAULT_AI_MODEL),
    storyModel: pickModel(o.storyModel, DEFAULT_STORY_MODEL),
    apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
  };
}

export function saveAiSettings(s: { model: AiModel; storyModel: AiModel; apiKey: string }) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ provider: "deepseek", model: s.model, storyModel: s.storyModel, apiKey: s.apiKey }));
}

export function aiPublicInfo(): AiPublicInfo {
  const s = getAiSettings();
  return { configured: s.apiKey !== "", model: s.model, storyModel: s.storyModel, keyHint: s.apiKey ? `••••${s.apiKey.slice(-4)}` : "" };
}
