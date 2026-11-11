// ElevenLabs（对白 / 旁白 / 配乐）。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import { getDb } from "@/lib/db";

const BASE = "https://api.elevenlabs.io/v1";

const STATUS_MESSAGES: Record<number, string> = {
  401: "ElevenLabs Key 无效",
  403: "ElevenLabs Key 没有读取账户信息的权限（创建 Key 时勾选 User: Read）",
  429: "ElevenLabs 请求过于频繁或额度用完，请稍后再试",
  500: "ElevenLabs 服务器错误，请稍后再试",
};

export function getElevenLabsKey(): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'elevenlabs'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return typeof o.apiKey === "string" ? o.apiKey : "";
  } catch {
    return "";
  }
}

export function saveElevenLabsKey(apiKey: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('elevenlabs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ apiKey }));
}

export function elevenLabsPublicInfo(): { configured: boolean; keyHint: string } {
  const k = getElevenLabsKey();
  return { configured: k !== "", keyHint: k ? `••••${k.slice(-4)}` : "" };
}

/** 读取账户信息测试连接，不产生费用；返回本月已用 / 总字符额度 */
export async function testElevenLabs(): Promise<{ used: number; limit: number; tier: string }> {
  const key = getElevenLabsKey();
  if (!key) throw new Error("尚未配置 ElevenLabs Key");
  const res = await fetch(`${BASE}/user`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(STATUS_MESSAGES[res.status] ?? `ElevenLabs 返回 ${res.status}`);
  const j = (await res.json()) as { subscription?: { character_count?: number; character_limit?: number; tier?: string } };
  const s = j.subscription ?? {};
  return { used: s.character_count ?? 0, limit: s.character_limit ?? 0, tier: s.tier ?? "" };
}
