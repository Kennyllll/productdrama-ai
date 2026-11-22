"use server";

import { adminError, currentActor } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { revalidatePath } from "next/cache";
import { brainPublicInfo, kimiChat, saveBrainKey } from "@/lib/brain/kimi";
import type { FormState } from "@/lib/types";

const CRED_RE = /^[\x21-\x7e]{6,300}$/;

export async function saveBrainKeyAction(input: { apiKey: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "修改设置", detail: "Kimi Key（Key 本身不记）" });
  if (input.clear) saveBrainKey("");
  else {
    const k = (input.apiKey ?? "").trim();
    if (!CRED_RE.test(k)) return { error: "Key 格式不正确" };
    saveBrainKey(k);
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除 Kimi Key" : "已保存到本机", info: brainPublicInfo() };
}

/** 发一句很短的话测试连接，约 $0.001 */
export async function testBrainAction(): Promise<FormState> {
  try {
    const { usage } = await kimiChat({ messages: [{ role: "user", content: "只回复：好" }], effort: "low", maxTokens: 2000, timeoutMs: 90_000 });
    return { ok: `连接成功（本次约 $${usage.usd.toFixed(4)}）` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "连接失败" };
  }
}
