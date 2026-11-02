"use server";

import { revalidatePath } from "next/cache";
import { sanitizeCreative, sanitizeScript } from "@/lib/creative";
import { findLocalProject, saveCreative, saveScript } from "@/lib/repo";
import type { FormState } from "@/lib/types";

export async function saveCreativeAction(projectId: string, data: unknown): Promise<FormState> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目，无法保存" };
  saveCreative(projectId, sanitizeCreative(data));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "已保存到本机" };
}

export async function saveScriptAction(projectId: string, data: unknown): Promise<FormState> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目，无法保存" };
  saveScript(projectId, sanitizeScript(data));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "已保存到本机" };
}
