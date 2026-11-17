// 火山方舟（国内）适配器：直接调字节 Seedance 出视频。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import fs from "node:fs";
import { getDb } from "@/lib/db";
import { HiggsfieldError, type HfRequest } from "@/lib/higgsfield";

export const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";
/** Seedance 2.5（方舟模型 ID） */
export const ARK_VIDEO_MODEL = "doubao-seedance-2-5-260628";
/** 方舟官方价：Seedance 2.5，480p/720p、输入不含视频，70 元 / 百万 token */
export const ARK_CNY_PER_MTOKEN = 70;
export const CNY_PER_USD = 7.1;
/** 官方 token 估算：时长 × 宽 × 高 × 帧率 / 1024（9:16 竖屏，按 24 帧） */
const SIZE = { "480p": [480, 864], "720p": [720, 1280] } as const;
const FPS = 24;

export const arkTokens = (resolution: keyof typeof SIZE, seconds: number) => (seconds * SIZE[resolution][0] * SIZE[resolution][1] * FPS) / 1024;
export const arkUsd = (tokens: number) => (tokens * ARK_CNY_PER_MTOKEN) / 1e6 / CNY_PER_USD;
export const arkUsdPerSec = (resolution: keyof typeof SIZE) => arkUsd(arkTokens(resolution, 1));

export const isArkModel = (model: string) => model.startsWith("doubao-");

/** 继承 HiggsfieldError：任务流程里 4xx 作废、5xx/网络重试的判断照旧可用 */
export class ArkError extends HiggsfieldError {}

export function getArkKey(): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'ark'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return typeof o.key === "string" ? o.key : "";
  } catch {
    return "";
  }
}

export function saveArkKey(key: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('ark', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ key }));
}

export function arkPublicInfo(): { configured: boolean; keyHint: string } {
  const k = getArkKey();
  return { configured: !!k, keyHint: k ? `••••${k.slice(-4)}` : "" };
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求参数不对",
  401: "方舟 API Key 无效",
  403: "账号没有权限，或模型还没开通（Seedance 2.x 要求账户余额超过 200 元）",
  404: "模型或任务不存在",
  429: "请求过于频繁，或账户额度不够",
  500: "方舟服务器错误",
  503: "方舟服务暂不可用",
};

async function ark(pathname: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<unknown> {
  const key = getArkKey();
  if (!key) throw new ArkError("尚未配置方舟 API Key，请到「模型设置」填写");
  let res: Response;
  try {
    res = await fetch(`${ARK_BASE}${pathname}`, {
      method: opts.method ?? "GET",
      headers: { Authorization: `Bearer ${key}`, ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch {
    throw new ArkError("网络错误，无法连接火山方舟");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    const detail = [e?.code, e?.message].filter(Boolean).join("：");
    throw new ArkError(`${STATUS_MESSAGES[res.status] ?? `方舟返回错误（HTTP ${res.status}）`}${detail ? `（${detail.slice(0, 300)}）` : ""}`, res.status);
  }
  return data;
}

/** 存进任务记录的输入：首帧只存本机路径，提交时才转成 Base64，不把图片塞进数据库 */
export interface ArkVideoInput {
  prompt: string;
  first_frame_file: string;
  first_frame_mime: string;
  duration: number;
  resolution: keyof typeof SIZE;
  generate_audio: boolean;
}

export async function arkSubmitVideo(model: string, input: ArkVideoInput): Promise<{ request_id: string }> {
  if (!fs.existsSync(input.first_frame_file)) throw new ArkError("首帧文件不存在", 400);
  const b64 = fs.readFileSync(input.first_frame_file).toString("base64");
  const r = (await ark("/contents/generations/tasks", {
    method: "POST",
    timeoutMs: 120_000,
    body: {
      model,
      content: [
        { type: "text", text: input.prompt },
        { type: "image_url", image_url: { url: `data:${input.first_frame_mime.toLowerCase()};base64,${b64}` }, role: "first_frame" },
      ],
      resolution: input.resolution,
      ratio: "9:16",
      duration: input.duration,
      generate_audio: input.generate_audio,
      watermark: false,
    },
  })) as { id?: string } | null;
  if (!r?.id) throw new ArkError("方舟没有返回任务 ID");
  return { request_id: r.id };
}

const STATUS: Record<string, HfRequest["status"]> = {
  queued: "queued",
  running: "in_progress",
  succeeded: "completed",
  failed: "failed",
  expired: "failed",
  cancelled: "canceled",
};

/** 查任务，换成和 Higgsfield 一样的结构；usage 是方舟实际计费的 token */
export async function arkGetTask(id: string): Promise<HfRequest & { tokens?: number }> {
  const r = (await ark(`/contents/generations/tasks/${encodeURIComponent(id)}`)) as {
    status?: string;
    content?: { video_url?: string };
    error?: { code?: string; message?: string } | null;
    usage?: { completion_tokens?: number };
  } | null;
  const status = STATUS[r?.status ?? ""] ?? "queued";
  const err = r?.error ? [r.error.code, r.error.message].filter(Boolean).join("：") : r?.status === "expired" ? "任务超时" : "";
  return {
    request_id: id,
    status,
    video: r?.content?.video_url ? { url: r.content.video_url } : undefined,
    error: err || undefined,
    tokens: typeof r?.usage?.completion_tokens === "number" ? r.usage.completion_tokens : undefined,
  };
}

/** 免费验证 Key：只查任务列表，不生成 */
export async function testArkKey(): Promise<string> {
  await ark("/contents/generations/tasks?page_num=1&page_size=1");
  return "Key 有效";
}
