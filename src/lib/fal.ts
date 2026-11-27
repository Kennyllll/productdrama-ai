// fal.ai 适配器：白底照建白模、给白模贴颜色。仅服务端调用；Key 只保存在本机 SQLite，不记录日志。
import { getDb } from "@/lib/db";

export class FalError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export function getFalKey(): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'fal'").get() as { value: string } | undefined;
  try {
    const o = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
    return typeof o.key === "string" ? o.key : "";
  } catch {
    return "";
  }
}

export function saveFalKey(key: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('fal', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ key }));
}

export function falPublicInfo(): { configured: boolean; keyHint: string } {
  const k = getFalKey();
  return { configured: !!k, keyHint: k ? `••••${k.slice(-4)}` : "" };
}

import type { Provider } from "@/lib/fal-catalog";

export { COLOR_REQUIRED, findProvider, PROVIDERS, WHITE_ANGLES, WHITE_REQUIRED, type Provider, type Target } from "@/lib/fal-catalog";

/** 组装请求：images 是各面照片的 data URI；meshUrl 是要贴色的白模地址 */
export function buildInput(p: Provider, images: Record<string, string>, meshUrl?: string): Record<string, unknown> {
  switch (p.id) {
    case "tripo":
      return { front_image_url: images["正面"], left_image_url: images["左侧"], back_image_url: images["背面"], right_image_url: images["右侧"], texture: "no", pbr: false };
    case "rodin":
      // concat：同一个物体的多张照片，顺序不限
      return { input_image_urls: Object.values(images), condition_mode: "concat", geometry_file_format: "glb", material: "PBR", quality: "medium", tier: "Regular" };
    case "hunyuan":
      return { front_image_url: images["正面"], back_image_url: images["背面"], left_image_url: images["左侧"], textured_mesh: false };
    case "meshy":
      return { model_url: meshUrl, image_style_url: images.ref, enable_original_uv: true, texture_resolution: "2k" };
    case "trellis":
      return { mesh_url: meshUrl, image_url: images.ref, resolution: 1024, texture_size: 2048 };
    default:
      throw new FalError("未知的建模服务");
  }
}

/** 从结果里取 GLB 地址（各家字段名不同） */
export function outputUrl(data: unknown): string | null {
  const d = data as Record<string, { url?: unknown } | undefined> | null;
  for (const k of ["model_glb", "model_mesh", "glb"]) {
    const u = d?.[k]?.url;
    if (typeof u === "string") return u;
  }
  const urls = (data as { model_urls?: { glb?: { url?: unknown } | string } } | null)?.model_urls?.glb;
  if (typeof urls === "string") return urls;
  if (urls && typeof urls.url === "string") return urls.url;
  return null;
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "请求格式错误",
  401: "fal Key 无效",
  403: "fal 账号没有权限或余额不足",
  404: "模型不存在或任务已过期",
  422: "参数不符合该模型要求",
  429: "请求过于频繁，请稍后再试",
  500: "fal 服务器错误",
};

async function fal(url: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<unknown> {
  const key = getFalKey();
  if (!key) throw new FalError("尚未配置 fal Key，请到左边「设置」填写");
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: { Authorization: `Key ${key}`, ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch {
    throw new FalError("网络错误，无法连接 fal");
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
    const raw = typeof d?.detail === "string" ? d.detail : typeof d?.message === "string" ? d.message : d?.detail ? JSON.stringify(d.detail) : "";
    throw new FalError(`${STATUS_MESSAGES[res.status] ?? `fal 返回错误（HTTP ${res.status}）`}${raw ? `：${raw.slice(0, 300)}` : ""}`, res.status);
  }
  return data;
}

export interface QueueRef {
  request_id: string;
  status_url: string;
  response_url: string;
}

export async function submit(endpoint: string, input: Record<string, unknown>): Promise<QueueRef> {
  const r = (await fal(`https://queue.fal.run/${endpoint}`, { method: "POST", body: input, timeoutMs: 120_000 })) as Partial<QueueRef> | null;
  if (!r?.request_id || !r.status_url || !r.response_url) throw new FalError("fal 没有返回任务编号");
  return r as QueueRef;
}

export async function queueStatus(statusUrl: string): Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"> {
  const r = (await fal(statusUrl)) as { status?: string } | null;
  const s = r?.status;
  return s === "COMPLETED" || s === "IN_PROGRESS" ? s : "IN_QUEUE";
}

export const queueResult = (responseUrl: string) => fal(responseUrl, { timeoutMs: 120_000 });

/** 把本机文件传到 fal 存储（免费），返回给模型用的地址；和官方 @fal-ai/client 单次上传同一个接口 */
export async function uploadToFal(bytes: Buffer, contentType: string, fileName: string): Promise<string> {
  const r = (await fal("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", { method: "POST", body: { content_type: contentType, file_name: fileName } })) as {
    upload_url?: string;
    file_url?: string;
  } | null;
  if (!r?.upload_url || !r.file_url) throw new FalError("fal 存储没有返回上传地址");
  let put: Response;
  try {
    put = await fetch(r.upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(600_000) });
  } catch {
    throw new FalError("网络错误，模型上传到 fal 失败（还没提交建模，不收费）");
  }
  if (!put.ok) throw new FalError(`模型上传到 fal 失败（HTTP ${put.status}，还没提交建模，不收费）`, put.status);
  return r.file_url;
}

/** 免费检查 Key：查一个不存在的任务，Key 无效会返回 401/403 */
export async function testFalKey(): Promise<string> {
  try {
    await fal("https://queue.fal.run/fal-ai/hunyuan3d/requests/00000000-0000-0000-0000-000000000000/status");
    return "Key 有效";
  } catch (e) {
    if (e instanceof FalError && (e.status === 401 || e.status === 403)) throw e;
    if (e instanceof FalError && e.status) return "Key 有效";
    throw e;
  }
}
