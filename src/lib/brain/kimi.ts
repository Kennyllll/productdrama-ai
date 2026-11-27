// 项目大脑的模型：Kimi K3.1 Pro（OpenAI 兼容 Chat Completions）。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import "server-only";
import { getDb } from "@/lib/db";

export const BRAIN_MODEL = "kimi-k3.1-pro";
/** 国际站和国内站的 Key 不通用：先用上次能用的，401 时换另一个并记住 */
const BASES = ["https://api.moonshot.ai/v1", "https://api.moonshot.cn/v1"] as const;
/** 美元 / 百万 token（platform.kimi.ai 价目，2026-11） */
const PRICE = { input: 2, cached: 0.2, output: 10 };

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求格式错误",
  401: "Kimi Key 无效，请到左边「设置」检查",
  402: "Kimi 账户余额不足，请充值后再试",
  403: "Kimi Key 无权限：旗舰模型需要账户至少充值 $1",
  429: "Kimi 请求过于频繁或额度用完，请稍后再试",
  500: "Kimi 服务器错误，请稍后再试",
  503: "Kimi 服务繁忙，请稍后再试",
};

export class BrainError extends Error {}

function brainRow(): Record<string, unknown> {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'brain'").get() as { value: string } | undefined;
  try {
    return row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getBrainKey(): string {
  const o = brainRow();
  return typeof o.apiKey === "string" ? o.apiKey : "";
}

function preferredBase(): string {
  const b = brainRow().baseUrl;
  return typeof b === "string" && (BASES as readonly string[]).includes(b) ? b : BASES[0];
}

function rememberBase(baseUrl: string) {
  getDb()
    .prepare("UPDATE settings SET value = ? WHERE key = 'brain'")
    .run(JSON.stringify({ ...brainRow(), baseUrl }));
}

export function saveBrainKey(apiKey: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('brain', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ provider: "kimi", model: BRAIN_MODEL, apiKey }));
}

export function brainPublicInfo(): { configured: boolean; keyHint: string } {
  const k = getBrainKey();
  return { configured: k !== "", keyHint: k ? `••••${k.slice(-4)}` : "" };
}

export type KimiPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface KimiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | KimiPart[] | null;
  reasoning_content?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}
export interface KimiUsage {
  input: number;
  cached: number;
  output: number;
  usd: number;
}

export const costOf = (input: number, cached: number, output: number) =>
  ((input - cached) * PRICE.input + cached * PRICE.cached + output * PRICE.output) / 1_000_000;

/** 一次对话请求。K3.1 Pro 一直开着思考：不传 temperature，max_tokens 要够装下思考 + 回答 */
export async function kimiChat(opts: {
  messages: KimiMessage[];
  effort?: "low" | "high" | "max";
  maxTokens?: number;
  json?: boolean;
  tools?: unknown[];
  timeoutMs?: number;
}): Promise<{ message: KimiMessage; usage: KimiUsage }> {
  const key = getBrainKey();
  if (!key) throw new BrainError("尚未配置 Kimi Key，请先到左边「设置」填写");
  const body = JSON.stringify({
    model: BRAIN_MODEL,
    messages: opts.messages,
    reasoning_effort: opts.effort ?? "high",
    max_tokens: opts.maxTokens ?? 16_000,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
    stream: false,
  });
  const first = preferredBase();
  const order = [first, ...BASES.filter((b) => b !== first)];
  let res: Response | null = null;
  for (const base of order) {
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new BrainError(timedOut ? "Kimi 响应超时，请稍后重试" : "网络错误，无法连接 Kimi");
    }
    if (res.status !== 401) {
      if (base !== first) rememberBase(base);
      break;
    }
  }
  if (!res) throw new BrainError("网络错误，无法连接 Kimi");
  if (!res.ok) throw new BrainError(STATUS_MESSAGES[res.status] ?? `Kimi 返回错误（HTTP ${res.status}）`);
  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: KimiMessage; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  } | null;
  const choice = data?.choices?.[0];
  if (!choice?.message) throw new BrainError("Kimi 没有返回内容，请重试");
  if (choice.finish_reason === "length") throw new BrainError("Kimi 输出被截断，请重试");
  const input = data?.usage?.prompt_tokens ?? 0;
  const cached = data?.usage?.cached_tokens ?? data?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const output = data?.usage?.completion_tokens ?? 0;
  return { message: choice.message, usage: { input, cached, output, usd: costOf(input, cached, output) } };
}

export function parseJson(content: KimiMessage["content"]): unknown {
  const t = (typeof content === "string" ? content : "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    throw new BrainError("Kimi 返回的不是有效 JSON，请重试");
  }
}
