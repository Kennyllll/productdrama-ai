"use server";

import { revalidatePath } from "next/cache";
import { estimate, getHfCreds, hfPublicInfo, HiggsfieldError, saveHfCreds } from "@/lib/higgsfield";
import type { FormState } from "@/lib/types";
import { saveVisionKey, testVision, visionPublicInfo } from "@/lib/vision-qa";

const CRED_RE = /^[\x21-\x7e]{6,300}$/;

export async function saveHfCredsAction(input: { keyId: string; secret: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  if (input.clear) {
    saveHfCreds({ keyId: "", secret: "" });
  } else {
    const cur = getHfCreds();
    let rawId = (input.keyId ?? "").trim();
    let rawSecret = (input.secret ?? "").trim();
    if (!rawSecret && rawId.includes(":")) {
      const i = rawId.indexOf(":");
      rawSecret = rawId.slice(i + 1);
      rawId = rawId.slice(0, i);
    }
    const keyId = rawId || cur.keyId;
    const secret = rawSecret || cur.secret;
    if (!CRED_RE.test(keyId) || !CRED_RE.test(secret)) return { error: "Key ID 或 Secret 格式不正确" };
    saveHfCreds({ keyId, secret });
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除 Higgsfield 凭证" : "已保存到本机", info: hfPublicInfo() };
}

const CHECKS: { label: string; endpoint: string; input: Record<string, unknown> }[] = [
  { label: "Soul V2 图像", endpoint: "higgsfield-ai/soul/v2/standard", input: { prompt: "connectivity check" } },
  {
    label: "Seedance 2.5 图生视频（720p · 5 秒）",
    endpoint: "bytedance/seedance-2.5/image-to-video",
    input: { image_url: "https://example.com/input.jpg", duration: 5, resolution: "720p", generate_audio: false },
  },
];

/** 用估价接口测试连接和模型可用性，不产生费用 */
export async function testHfAction(): Promise<FormState & { checks?: { label: string; result: string }[] }> {
  const checks: { label: string; result: string }[] = [];
  for (const c of CHECKS) {
    try {
      const { usd, description } = await estimate(c.endpoint, c.input);
      checks.push({ label: c.label, result: Number.isFinite(usd) ? `可用，预估 $${usd}` : description ? `可用。${description.slice(0, 240)}` : "可用" });
    } catch (e) {
      if (e instanceof HiggsfieldError && e.status === 401) return { error: e.message };
      checks.push({ label: c.label, result: e instanceof Error ? e.message : "检测失败" });
    }
  }
  return { ok: "连接成功（估价接口，不产生费用）", checks };
}

export async function saveVisionKeyAction(input: { apiKey: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  if (input.clear) saveVisionKey("");
  else {
    const k = (input.apiKey ?? "").trim();
    if (!CRED_RE.test(k)) return { error: "Key 格式不正确" };
    saveVisionKey(k);
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除 Gemini Key" : "已保存到本机", info: visionPublicInfo() };
}

export async function testVisionAction(): Promise<FormState> {
  try {
    await testVision();
    return { ok: "连接成功" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "连接失败" };
  }
}
