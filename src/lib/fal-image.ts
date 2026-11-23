// 短视频首帧：fal 上的 Seedream 4.5（多参考图编辑）。返回值和 Higgsfield 同一个形状，任务流程不用分叉
import { FalError, queueResult, queueStatus, submit } from "@/lib/fal";
import { HiggsfieldError, type HfRequest } from "@/lib/higgsfield";

export const isFalModel = (model: string) => model.startsWith("fal-ai/");

// fal 的子路径模型（fal-ai/bytedance/seedream/...）查进度要用应用根路径
const requestUrl = (model: string, id: string) => `https://queue.fal.run/${model.split("/").slice(0, 2).join("/")}/requests/${id}`;
const asHf = (e: unknown) => (e instanceof FalError ? new HiggsfieldError(e.message, e.status) : e);

export async function falSubmitImage(model: string, input: Record<string, unknown>): Promise<{ request_id: string }> {
  try {
    return { request_id: (await submit(model, input)).request_id };
  } catch (e) {
    throw asHf(e);
  }
}

export async function falGetImage(model: string, id: string): Promise<HfRequest> {
  const url = requestUrl(model, id);
  let s;
  try {
    s = await queueStatus(`${url}/status`);
  } catch (e) {
    throw asHf(e);
  }
  if (s !== "COMPLETED") return { request_id: id, status: s === "IN_PROGRESS" ? "in_progress" : "queued" };
  try {
    const r = (await queueResult(url)) as { images?: { url?: string }[]; has_nsfw_concepts?: boolean[] } | null;
    if (r?.has_nsfw_concepts?.[0]) return { request_id: id, status: "nsfw" };
    const u = r?.images?.[0]?.url;
    return u ? { request_id: id, status: "completed", images: [{ url: u }] } : { request_id: id, status: "failed", error: "fal 没有返回图片" };
  } catch (e) {
    // 生成本身失败（参数 / 审核）：fal 在结果地址返回 4xx，不收费
    if (e instanceof FalError && e.status && e.status < 500) return { request_id: id, status: "failed", error: e.message };
    throw asHf(e);
  }
}
