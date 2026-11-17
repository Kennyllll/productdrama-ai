"use server";

import { revalidatePath } from "next/cache";
import { cleanFamily } from "@/lib/families";
import { createFamily, deleteFamily, getFamily, saveFamily } from "@/lib/families-repo";

type Result<T> = { result?: T; error?: string };

export async function saveFamilyAction(id: string | null, data: unknown): Promise<Result<string>> {
  const f = cleanFamily(data);
  if (!f) return { error: "家庭名字不能为空" };
  if (!f.members.length) return { error: "至少要有一个成员" };
  if (id) {
    if (!getFamily(id)) return { error: "家庭不存在" };
    saveFamily(id, f);
  } else id = createFamily(f);
  revalidatePath("/families");
  return { result: id };
}

export async function deleteFamilyAction(id: string): Promise<Result<true>> {
  if (!deleteFamily(id)) return { error: "家庭不存在" };
  revalidatePath("/families");
  return { result: true };
}
