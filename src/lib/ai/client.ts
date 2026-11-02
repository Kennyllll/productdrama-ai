// OpenAI 兼容的 Chat Completions 适配器（当前接 DeepSeek）。仅服务端调用，错误转为中文提示，不记录 Key。
import type { AiUsage } from "@/lib/ai/models";
import { getAiSettings } from "@/lib/ai/settings";

export class AiError extends Error {}

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求格式错误",
  401: "API Key 无效，请到「模型设置」检查",
  402: "DeepSeek 账户余额不足，请充值后再试",
  422: "请求参数错误",
  429: "请求过于频繁，请稍后再试",
  500: "DeepSeek 服务器错误，请稍后再试",
  503: "DeepSeek 服务繁忙，请稍后再试",
};

export async function chatJson(opts: {
  system: string;
  user: string;
  maxTokens: number;
  thinking?: boolean;
  timeoutMs?: number;
}): Promise<{ data: unknown; usage: AiUsage }> {
  const s = getAiSettings();
  if (!s.apiKey) throw new AiError("尚未配置 API Key，请先到「模型设置」填写");

  let res: Response;
  try {
    res = await fetch(`${s.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify({
        model: s.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_object" },
        thinking: { type: opts.thinking === false ? "disabled" : "enabled" },
        max_tokens: opts.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new AiError(timedOut ? "DeepSeek 响应超时，请稍后重试" : "网络错误，无法连接 DeepSeek");
  }

  if (!res.ok) throw new AiError(STATUS_MESSAGES[res.status] ?? `DeepSeek 返回错误（HTTP ${res.status}）`);

  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "length") throw new AiError("模型输出被截断，请重试");
  const content = choice?.message?.content?.trim();
  if (!content) throw new AiError("模型没有返回内容，请重试");

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new AiError("模型返回的不是有效 JSON，请重试");
  }
  return {
    data,
    usage: { promptTokens: body?.usage?.prompt_tokens ?? 0, completionTokens: body?.usage?.completion_tokens ?? 0 },
  };
}
