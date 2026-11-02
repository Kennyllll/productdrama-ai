"use server";

import { revalidatePath } from "next/cache";
import { addUsage, AiError, chatJson } from "@/lib/ai/client";
import { AI_MODELS, type AiModel, type AiPublicInfo, type AiUsage, type ScriptReview } from "@/lib/ai/models";
import { criticPrompt, proposalPrompt, REVIEW_CRITERIA, scriptPrompt, storyboardPrompt, storyCorePrompt } from "@/lib/ai/prompts";
import { aiPublicInfo, getAiSettings, saveAiSettings } from "@/lib/ai/settings";
import { getEgg, getProjectEggId, listCharacters } from "@/lib/cast-repo";
import { sanitizeCreative, sanitizeScript } from "@/lib/creative";
import { filmStyles } from "@/lib/mock/demo";
import { findLocalProject, getCreative, getProduct, getScript } from "@/lib/repo";
import { aiToStoryboard } from "@/lib/storyboard";
import type { FormState, LocalCreative, LocalProposal, LocalScript, LocalStoryboard, StoryCore } from "@/lib/types";

export interface AiResult<T> {
  error?: string;
  result?: T;
  usage?: AiUsage;
}

type CreativeDraft = Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId"> & { storyCore?: StoryCore };

const failure = (e: unknown): { error: string } => ({
  error: e instanceof AiError ? e.message : "AI 调用失败，请稍后重试",
});

const isModel = (m: unknown): m is AiModel => AI_MODELS.includes(m as AiModel);

export async function saveAiSettingsAction(input: { model: string; storyModel: string; apiKey: string; clearKey: boolean }): Promise<FormState & { info?: AiPublicInfo }> {
  if (!isModel(input.model) || !isModel(input.storyModel)) return { error: "未知模型" };
  const current = getAiSettings();
  const key = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (key && !/^[\x21-\x7e]{10,200}$/.test(key)) return { error: "API Key 格式不正确" };
  saveAiSettings({ model: input.model, storyModel: input.storyModel, apiKey: input.clearKey ? "" : key || current.apiKey });
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

export async function aiStoryCoreAction(projectId: string, draft: CreativeDraft): Promise<AiResult<StoryCore>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const c = sanitizeCreative(draft);
  try {
    const { system, user } = storyCorePrompt(getProduct(projectId), c, listCharacters(projectId));
    const { data, usage } = await chatJson({ system, user, maxTokens: 16_000, purpose: "story" });
    const core = sanitizeCreative({ storyCore: (data as { storyCore?: unknown })?.storyCore }).storyCore;
    if (!core.protagonist.trim() && !core.truth.trim()) return { error: "AI 没有返回可用的故事内核，请重试", usage };
    return { result: core, usage };
  } catch (e) {
    return failure(e);
  }
}

export async function aiProposalsAction(projectId: string, draft: CreativeDraft): Promise<AiResult<LocalProposal[]>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const c = sanitizeCreative(draft);
  try {
    const { system, user } = proposalPrompt(getProduct(projectId), c, listCharacters(projectId));
    const { data, usage } = await chatJson({ system, user, maxTokens: 24_000, purpose: "story" });
    const proposals = sanitizeCreative({ proposals: (data as { proposals?: unknown })?.proposals })
      .proposals.filter((p) => p.title.trim() && p.logline.trim())
      .map((p) => ({ ...p, source: "ai" as const }));
    if (proposals.length === 0) return { error: "AI 没有返回可用的提案，请重试", usage };
    return { result: proposals, usage };
  } catch (e) {
    return failure(e);
  }
}

const incomplete = (s: LocalScript) => s.episodes.some((ep) => ep.beats.length === 0 || ep.scenes.length === 0);

function sanitizeReview(raw: unknown): ScriptReview {
  const r = raw && typeof raw === "object" ? (raw as { scores?: unknown; problems?: unknown }) : {};
  const scores = r.scores && typeof r.scores === "object" ? (r.scores as Record<string, unknown>) : {};
  return {
    scores: REVIEW_CRITERIA.map((label) => ({ label, score: Math.max(1, Math.min(10, Math.round(Number(scores[label]) || 0))) })),
    problems: (Array.isArray(r.problems) ? r.problems : []).filter((p): p is string => typeof p === "string").slice(0, 8).map((p) => p.slice(0, 300)),
  };
}

export async function aiScriptAction(projectId: string, critique: boolean): Promise<AiResult<{ script: LocalScript; review?: ScriptReview }>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const creative = getCreative(projectId);
  const proposal = creative.proposals.find((p) => p.id === creative.selectedProposalId);
  if (!proposal) return { error: "请先在创意页选定一个提案并保存" };
  const eggId = getProjectEggId(projectId);
  const input = { product: getProduct(projectId), creative, proposal, characters: listCharacters(projectId), egg: eggId ? getEgg(eggId) : null };
  try {
    const first = scriptPrompt(input);
    const { data, usage } = await chatJson({ ...first, maxTokens: 32_000, purpose: "story" });
    const draft = sanitizeScript({ proposalId: proposal.id, episodes: (data as { episodes?: unknown })?.episodes });
    if (incomplete(draft)) return { error: "AI 返回的剧本不完整（缺少节拍或场景），请重试", usage };
    if (!critique) return { result: { script: draft }, usage };

    const second = criticPrompt(input, draft);
    const res2 = await chatJson({ ...second, maxTokens: 40_000, purpose: "story" });
    const total = addUsage(usage, res2.usage);
    const d2 = (res2.data ?? {}) as { review?: unknown; episodes?: unknown };
    const review = sanitizeReview(d2.review);
    const revised = sanitizeScript({ proposalId: proposal.id, episodes: d2.episodes });
    if (incomplete(revised)) {
      return { result: { script: draft, review: { ...review, problems: [...review.problems, "（监制改写版不完整，以下为编剧初稿）"] } }, usage: total };
    }
    return { result: { script: revised, review }, usage: total };
  } catch (e) {
    return failure(e);
  }
}

export async function aiStoryboardAction(projectId: string): Promise<AiResult<LocalStoryboard>> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const script = getScript(projectId);
  if (!script) return { error: "请先在剧本工作台生成剧本" };
  const creative = getCreative(projectId);
  const style = filmStyles.find((f) => f.id === creative.styleId) ?? filmStyles[0];
  const characters = listCharacters(projectId);
  const eggId = getProjectEggId(projectId);
  const egg = eggId ? getEgg(eggId) : null;
  try {
    const { system, user } = storyboardPrompt({ product: getProduct(projectId), creative, script, characters, egg });
    const { data, usage } = await chatJson({ system, user, maxTokens: 48_000 });
    const board = aiToStoryboard(data, { proposalId: script.proposalId, style, cast: characters, hasEgg: !!egg });
    if (board.episodes.some((ep) => ep.shots.length === 0)) return { error: "AI 返回的分镜不完整，请重试", usage };
    return { result: board, usage };
  } catch (e) {
    return failure(e);
  }
}
