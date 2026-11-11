"use server";

import { revalidatePath } from "next/cache";
import type { AiResult } from "@/app/ai-actions";
import { AiError, chatJson } from "@/lib/ai/client";
import { elevenLabsPublicInfo, saveElevenLabsKey, testElevenLabs } from "@/lib/elevenlabs";
import { soundPlanPrompt } from "@/lib/ai/prompts";
import { findLocalProject, getCreative, getScript } from "@/lib/repo";
import { sanitizeSoundPlan } from "@/lib/sound";
import { saveSoundPlan } from "@/lib/sound-repo";
import { getStoryboard } from "@/lib/storyboard-repo";
import type { FormState, SoundPlan } from "@/lib/types";

export async function saveSoundPlanAction(projectId: string, data: unknown): Promise<FormState> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目，无法保存" };
  const plan = sanitizeSoundPlan(data);
  if (!plan) return { error: "声音设计数据无效" };
  saveSoundPlan(projectId, plan);
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "已保存到本机" };
}

const KEY_RE = /^[\x21-\x7e]{6,300}$/;

export async function saveElevenLabsKeyAction(input: { apiKey: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  if (input.clear) saveElevenLabsKey("");
  else {
    const k = (input.apiKey ?? "").trim();
    if (!KEY_RE.test(k)) return { error: "Key 格式不正确" };
    saveElevenLabsKey(k);
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除 ElevenLabs Key" : "已保存到本机", info: elevenLabsPublicInfo() };
}

export async function testElevenLabsAction(): Promise<FormState> {
  try {
    const q = await testElevenLabs();
    if (!q) return { ok: "连接成功（这个 Key 没有 User: Read 权限，看不到额度，不影响生成）" };
    const { used, limit, tier } = q;
    return { ok: `连接成功${tier ? `（${tier}）` : ""}：本期已用 ${used.toLocaleString()} / ${limit.toLocaleString()} 字符额度` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "连接失败" };
  }
}

export async function aiSoundPlanAction(projectId: string): Promise<AiResult<SoundPlan>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const script = getScript(projectId);
  const board = getStoryboard(projectId);
  if (!script || !board) return { error: "请先完成剧本和分镜" };
  try {
    const { system, user } = soundPlanPrompt({ creative: getCreative(projectId), script, board });
    const { data, usage } = await chatJson({ system, user, maxTokens: 32_000, purpose: "story" });
    const plan = sanitizeSoundPlan({ ...(data && typeof data === "object" ? data : {}), sourceProposalId: script.proposalId });
    if (!plan || plan.episodes.some((ep) => ep.cues.length === 0)) return { error: "AI 返回的声音设计不完整，请重试", usage };
    return { result: plan, usage };
  } catch (e) {
    return { error: e instanceof AiError ? e.message : "AI 调用失败，请稍后重试" };
  }
}
