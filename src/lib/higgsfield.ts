// Higgsfield 适配器（TASK-011）：画面生成平台。仅服务端调用；凭证只保存在本机 SQLite，不记录日志。
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export const HF_BASE = "https://api.higgsfield.ai";

export class HiggsfieldError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface HfCreds {
  keyId: string;
  secret: string;
}

export function getHfCreds(): HfCreds {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'higgsfield'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return { keyId: typeof o.keyId === "string" ? o.keyId : "", secret: typeof o.secret === "string" ? o.secret : "" };
  } catch {
    return { keyId: "", secret: "" };
  }
}

export function saveHfCreds(c: HfCreds) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('higgsfield', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(c));
}

export function hfPublicInfo(): { configured: boolean; keyHint: string } {
  const c = getHfCreds();
  return { configured: !!(c.keyId && c.secret), keyHint: c.keyId ? `••••${c.keyId.slice(-4)}` : "" };
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求格式错误",
  401: "Key ID 或 Secret 无效",
  402: "Higgsfield 余额不足，请充值",
  403: "账号没有权限",
  404: "该模型对你的账号不可用，或端点不存在",
  422: "参数不符合该模型要求",
  423: "该模型暂时锁定，不可用",
  429: "请求过于频繁，请稍后再试",
  500: "Higgsfield 服务器错误",
  503: "该模型暂不可用",
};

async function hf(pathname: string, opts: { method?: string; body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {}): Promise<unknown> {
  const c = getHfCreds();
  if (!c.keyId || !c.secret) throw new HiggsfieldError("尚未配置 Higgsfield Key，请到「模型设置」填写");
  let res: Response;
  try {
    res = await fetch(`${HF_BASE}${pathname}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Key ${c.keyId}:${c.secret}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch {
    throw new HiggsfieldError("网络错误，无法连接 Higgsfield");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { detail?: unknown; message?: unknown } | null;
    const detail = typeof d?.detail === "string" ? d.detail : typeof d?.message === "string" ? d.message : "";
    throw new HiggsfieldError(`${STATUS_MESSAGES[res.status] ?? `Higgsfield 返回错误（HTTP ${res.status}）`}${detail ? `：${detail.slice(0, 200)}` : ""}`, res.status);
  }
  return data;
}

export type HfStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export interface HfRequest {
  request_id: string;
  status: HfStatus;
  images?: { url: string }[];
  video?: { url: string };
  expires_at?: string;
}

export async function estimate(endpoint: string, input: Record<string, unknown>): Promise<number> {
  const r = (await hf(`/estimate/${endpoint}`, { method: "POST", body: input })) as { usd?: string } | null;
  return Number(r?.usd ?? NaN);
}

export function submit(endpoint: string, input: Record<string, unknown>): Promise<HfRequest> {
  return hf(`/${endpoint}`, { method: "POST", body: input, idempotencyKey: randomUUID() }) as Promise<HfRequest>;
}

export function getStatus(requestId: string): Promise<HfRequest> {
  return hf(`/requests/${encodeURIComponent(requestId)}/status`) as Promise<HfRequest>;
}

export async function deleteRequest(requestId: string): Promise<void> {
  await hf(`/requests/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}

export async function waitFor(requestId: string, timeoutMs = 15 * 60_000): Promise<HfRequest> {
  const end = Date.now() + timeoutMs;
  let delay = 3000;
  while (Date.now() < end) {
    const r = await getStatus(requestId);
    if (r.status === "completed") return r;
    if (r.status === "failed") throw new HiggsfieldError("生成失败（不收费），请重试");
    if (r.status === "nsfw") throw new HiggsfieldError("内容被审核拦截（不收费），请调整画面描述");
    if (r.status === "canceled") throw new HiggsfieldError("任务已取消");
    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(15_000, Math.round(delay * 1.5));
  }
  throw new HiggsfieldError("等待生成结果超时，可稍后在任务列表中查看");
}

/** 上传本机文件，返回模型可用的公网 URL（需用户已同意上传） */
export async function uploadFile(bytes: Buffer, contentType: string): Promise<string> {
  const u = (await hf("/files/generate-upload-url", { method: "POST", body: { content_type: contentType } })) as {
    public_url: string;
    upload_url: string;
    upload_headers?: Record<string, string>;
  };
  const put = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers ?? { "Content-Type": contentType }, body: new Uint8Array(bytes) });
  if (!put.ok) throw new HiggsfieldError(`素材上传失败（HTTP ${put.status}）`);
  return u.public_url;
}
