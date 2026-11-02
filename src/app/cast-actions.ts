"use server";

import { revalidatePath } from "next/cache";
import { sanitizeCharacters, sanitizeEgg } from "@/lib/cast";
import { createEgg, deleteEgg, getEgg, saveCharacters, setProjectEgg, updateEgg } from "@/lib/cast-repo";
import { findLocalProject } from "@/lib/repo";
import type { FormState } from "@/lib/types";

const NOT_LOCAL: FormState = { error: "项目不存在或为示例项目，无法保存" };

export async function saveCastAction(projectId: string, data: unknown): Promise<FormState> {
  if (!findLocalProject(projectId)) return NOT_LOCAL;
  saveCharacters(projectId, sanitizeCharacters(data));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "已保存到本机" };
}

export async function setProjectEggAction(projectId: string, eggId: string | null): Promise<FormState> {
  if (!findLocalProject(projectId)) return NOT_LOCAL;
  if (eggId && !getEgg(eggId)) return { error: "彩蛋角色不存在" };
  setProjectEgg(projectId, eggId);
  return { ok: eggId ? "已选用该彩蛋角色" : "本项目不使用彩蛋" };
}

export async function createEggAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const egg = sanitizeEgg({ name: fd.get("name"), species: fd.get("species") });
  if (!egg.name) return { error: "请填写彩蛋角色名称" };
  createEgg(egg.name, egg.species);
  revalidatePath("/easter-eggs");
  return { ok: `已添加「${egg.name}」，请上传参考照` };
}

export async function updateEggAction(id: string, data: unknown): Promise<FormState> {
  const egg = sanitizeEgg(data);
  if (!egg.name) return { error: "名称不能为空" };
  if (!updateEgg(id, egg)) return { error: "彩蛋角色不存在" };
  revalidatePath("/easter-eggs");
  return { ok: "已保存" };
}

export async function deleteEggAction(id: string): Promise<FormState> {
  if (!deleteEgg(id)) return { error: "彩蛋角色不存在" };
  revalidatePath("/easter-eggs");
  return { ok: "已删除" };
}
