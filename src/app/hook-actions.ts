"use server";

import { revalidatePath } from "next/cache";
import { cleanHookData } from "@/lib/hooks";
import { createHook, deleteHook, getHook, saveHook } from "@/lib/hooks-repo";

type Result<T> = { result?: T; error?: string };

export async function saveHookAction(id: string | null, data: unknown): Promise<Result<string>> {
  const h = cleanHookData(data);
  if (!h) return { error: "Hook 名字不能为空" };
  if (id) {
    if (!getHook(id)) return { error: "Hook 不存在" };
    saveHook(id, h);
  } else id = createHook(h);
  revalidatePath("/hooks");
  return { result: id };
}

export async function deleteHookAction(id: string): Promise<Result<true>> {
  if (!deleteHook(id)) return { error: "Hook 不存在" };
  revalidatePath("/hooks");
  return { result: true };
}
