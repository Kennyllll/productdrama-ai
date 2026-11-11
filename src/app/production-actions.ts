"use server";

import { revalidatePath } from "next/cache";
import { findLocalProject } from "@/lib/repo";
import { addDecision, addGuideMessage, addRule, deleteRule, saveSetLayout, type GuideMessage, type RuleLayer, type SetLayout } from "@/lib/production-repo";

const LAYERS: RuleLayer[] = ["product", "character", "scene", "edit", "process"];
const MAX_TEXT = 2000;
const clean = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, MAX_TEXT) : "");

export async function sendGuideMessageAction(projectId: string, text: string, context: string): Promise<{ error?: string; messages?: GuideMessage[] }> {
  if (!findLocalProject(projectId)) return { error: "项目不存在" };
  const t = clean(text);
  if (!t) return { error: "消息是空的" };
  const ctx = clean(context).slice(0, 120);
  const user = addGuideMessage(projectId, "user", t, ctx);
  const guide = addGuideMessage(
    projectId,
    "guide",
    `向导还没接模型（要你先批准用云端 API），这次不能回答。你的话已经记进项目对话，标签是「${ctx || "项目"}」。要把它定成规矩，点这条消息下面的“记成决定”。`,
    ctx,
  );
  return { messages: [user, guide] };
}

export async function rememberDecisionAction(projectId: string, text: string, context: string): Promise<{ error?: string }> {
  if (!findLocalProject(projectId)) return { error: "项目不存在" };
  const t = clean(text);
  if (!t) return { error: "内容是空的" };
  addDecision(projectId, t, clean(context).slice(0, 120));
  revalidatePath(`/projects/${projectId}`, "layout");
  return {};
}

export async function addRuleAction(projectId: string, input: { layer: string; level: string; text: string; source: string }): Promise<{ error?: string }> {
  if (!findLocalProject(projectId)) return { error: "项目不存在" };
  const layer = LAYERS.find((l) => l === input.layer);
  const text = clean(input.text);
  if (!layer || !text) return { error: "请选择层级并填写规则" };
  addRule(projectId, { layer, level: input.level === "warn" ? "warn" : "must", text, source: clean(input.source).slice(0, 200) });
  revalidatePath(`/projects/${projectId}/rules`);
  return {};
}

export async function deleteRuleAction(projectId: string, id: string): Promise<void> {
  if (!findLocalProject(projectId)) return;
  deleteRule(projectId, id);
  revalidatePath(`/projects/${projectId}/rules`);
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

function sanitizeLayout(l: SetLayout): SetLayout | null {
  const lens = num(l.lens, 8, 400);
  const aspect = num(l.aspect, 0.3, 4);
  const v3 = (p: unknown) => (Array.isArray(p) && p.length === 3 && p.every((x) => num(x, -1e4, 1e4) !== null) ? (p as [number, number, number]) : null);
  const camPos = v3(l.camPos);
  const lookAt = v3(l.lookAt);
  if (lens === null || aspect === null || !camPos || !lookAt) return null;
  const bike = Array.isArray(l.bike) && l.bike.length === 2 && l.bike.every((x) => num(x, -1e4, 1e4) !== null) ? l.bike : undefined;
  return { lens, aspect, camPos, lookAt, bike, bikeYaw: num(l.bikeYaw, -720, 720) ?? 0, figure: Boolean(l.figure), source: clean(l.source).slice(0, 120) };
}

export async function saveSetLayoutAction(projectId: string, episode: number, code: string, layout: SetLayout | null): Promise<{ error?: string }> {
  if (!findLocalProject(projectId)) return { error: "项目不存在" };
  const data = layout ? sanitizeLayout(layout) : null;
  if (layout && !data) return { error: "布景数据不完整" };
  if (!saveSetLayout(projectId, episode, code, data)) return { error: "这个镜头没有布景数据" };
  revalidatePath(`/projects/${projectId}/set`);
  return {};
}
