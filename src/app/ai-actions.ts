"use server";

import { revalidatePath } from "next/cache";
import { AiError, chatJson } from "@/lib/ai/client";
import { AI_MODELS, type AiModel, type AiPublicInfo, type AiUsage } from "@/lib/ai/models";
import { proposalPrompt, scriptPrompt } from "@/lib/ai/prompts";
import { aiPublicInfo, getAiSettings, saveAiSettings } from "@/lib/ai/settings";
import { getEgg, getProjectEggId, listCharacters } from "@/lib/cast-repo";
import { sanitizeCreative, sanitizeScript } from "@/lib/creative";
import { findLocalProject, getCreative, getProduct } from "@/lib/repo";
import type { FormState, LocalCreative, LocalProposal, LocalScript } from "@/lib/types";

export interface AiResult<T> {
  error?: string;
  result?: T;
  usage?: AiUsage;
}

const failure = (e: unknown): { error: string } => ({
  error: e instanceof AiError ? e.message : "AI 调用失败，请稍后重试",
});

export async function saveAiSettingsAction(input: { model: string; apiKey: string; clearKey: boolean }): Promise<FormState & { info?: AiPublicInfo }> {
  if (!AI_MODELS.includes(input.model as AiModel)) return { error: "未知模型" };
  const current = getAiSettings();
  const key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (key && !/^[\x21-\x7e]{10,200}$/.test(key)) return { error: "API Key 格式不正确" };
  saveAiSettings({ model: input.model as AiModel, apiKey: input.clearKey ? "" : key || current.apiKey });
  revalidatePath("/", "layout");
  return { ok: input.clearKey ? "已清除 API Key" : "已保存到本机", info: aiPublicInfo() };
}

export async function testAiAction(): Promise<FormState> {
  try {
    await chatJson({
      system: "You are a connectivity check. Reply in json only.",
      user: 'Return exactly this json: {"ok": true}',
      maxTokens: 50,
      thinking: false,
      timeoutMs: 30_000,
    });
    return { ok: `连接成功（${getAiSettings().model}）` };
  } catch (e) {
    return failure(e);
  }
}

export async function aiProposalsAction(
  projectId: string,
  draft: Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId">,
): Promise<AiResult<LocalProposal[]>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const c = sanitizeCreative(draft);
  try {
    const { system, user } = proposalPrompt(getProduct(projectId), c);
    const { data, usage } = await chatJson({ system, user, maxTokens: 16_000 });
    const proposals = sanitizeCreative({ proposals: (data as { proposals?: unknown })?.proposals })
      .proposals.filter((p) => p.title.trim() && p.logline.trim())
      .map((p) => ({ ...p, source: "ai" as const }));
    if (proposals.length === 0) return { error: "AI 没有返回可用的提案，请重试", usage };
    return { result: proposals, usage };
  } catch (e) {
    return failure(e);
  }
}

export async function aiScriptAction(projectId: string): Promise<AiResult<LocalScript>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const creative = getCreative(projectId);
  const proposal = creative.proposals.find((p) => p.id === creative.selectedProposalId);
  if (!proposal) return { error: "请先在创意页选定一个提案并保存" };
  const eggId = getProjectEggId(projectId);
  try {
    const { system, user } = scriptPrompt({
      product: getProduct(projectId),
      creative,
      proposal,
      characters: listCharacters(projectId),
      egg: eggId ? getEgg(eggId) : null,
    });
    const { data, usage } = await chatJson({ system, user, maxTokens: 32_000 });
    const script = sanitizeScript({ proposalId: proposal.id, episodes: (data as { episodes?: unknown })?.episodes });
    if (script.episodes.some((ep) => ep.beats.length === 0 || ep.scenes.length === 0)) {
      return { error: "AI 返回的剧本不完整（缺少节拍或场景），请重试", usage };
    }
    return { result: script, usage };
  } catch (e) {
    return failure(e);
  }
}
