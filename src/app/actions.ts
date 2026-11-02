"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emptyBible } from "@/lib/mock/demo";
import { createProject, deleteProject, findLocalProject, saveProduct } from "@/lib/repo";
import type { FormState } from "@/lib/types";

const text = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max);

export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = text(fd, "name", 60);
  const brand = text(fd, "brand", 60);
  if (!name) return { error: "请填写项目名称" };
  const id = createProject(name, brand);
  revalidatePath("/dashboard");
  redirect(`/projects/${id}/product`);
}

export async function deleteProjectAction(fd: FormData): Promise<void> {
  deleteProject(text(fd, "id", 64));
  revalidatePath("/dashboard");
}

export async function saveProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const projectId = text(fd, "projectId", 64);
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };

  const sellingPoints = String(fd.get("sellingPoints") ?? "")
    .split("\n")
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 10);

  const bible = emptyBible.map((field) => ({
    ...field,
    value: text(fd, `bible.${field.key}.value`, 200),
    needsConfirmation: fd.get(`bible.${field.key}.confirmed`) !== "on",
  }));

  saveProduct(projectId, {
    name: text(fd, "name", 80),
    category: text(fd, "category", 80),
    sellingPoints,
    bible,
  });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: `已保存到本地数据库（${new Date().toLocaleTimeString("zh-CN", { hour12: false })}）` };
}
