"use server";

import { revalidatePath } from "next/cache";
import { findLocalProject } from "@/lib/repo";
import { sanitizeStoryboard } from "@/lib/storyboard";
import { saveStoryboard } from "@/lib/storyboard-repo";
import type { FormState } from "@/lib/types";

export async function saveStoryboardAction(projectId: string, data: unknown): Promise<FormState> {
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目，无法保存" };
  const board = sanitizeStoryboard(data);
  if (!board) return { error: "分镜数据无效" };
  saveStoryboard(projectId, board);
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "已保存到本机" };
}
