"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cleanFacts, FACT_KEYS, factsErrors } from "@/lib/ad-compliance";
import { saveAdFacts } from "@/lib/ad-facts-repo";
import { checkAgeRange, formatAge } from "@/lib/age-range";
import { emptyBible } from "@/lib/mock/demo";
import { createProject, deleteProject, findLocalProject, getProduct, saveProduct } from "@/lib/repo";
import type { FormState } from "@/lib/types";

const text = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max);

export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const name = text(fd, "name", 60);
  const brand = text(fd, "brand", 60);
  if (!name) return { error: "请先写产品名字，例如：KRIDDO TC003 儿童三轮车" };
  const kind = fd.get("kind") === "product" ? "product" : "series";
  const id = createProject(name, brand, kind);
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

  // 产品资料分几块保存：表单里没有的字段保持原样，不能被空值覆盖
  const old = getProduct(projectId);
  const sellingPoints = !fd.has("sellingPoints") && old ? old.sellingPoints : String(fd.get("sellingPoints") ?? "")
    .split("\n")
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, 10);

  const age = checkAgeRange(text(fd, "age.min", 8), text(fd, "age.max", 8), text(fd, "age.unit", 4));
  if ("error" in age) return { error: age.error };
  const bible = emptyBible.map((field) => (!fd.has(`bible.${field.key}.value`) && !(field.key === "age" && fd.has("age.min")) && old?.bible.find((b) => b.key === field.key)) || ({
    ...field,
    value: field.key === "age" ? (age.range ? formatAge(age.range) : "") : text(fd, `bible.${field.key}.value`, 200),
    needsConfirmation: fd.get(`bible.${field.key}.confirmed`) !== "on",
  }));
  const empty = bible.filter((f) => !f.needsConfirmation && !f.value);
  if (empty.length) return { error: `${empty.map((f) => f.label).join("、")}还没填，不能勾「已确认」` };

  saveProduct(projectId, {
    name: fd.has("name") || !old ? text(fd, "name", 80) : old.name,
    category: fd.has("category") || !old ? text(fd, "category", 80) : old.category,
    rideKind: fd.has("rideKind") ? text(fd, "rideKind", 20) : undefined,
    sellingPoints,
    bible,
  });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: `已保存到本地数据库（${new Date().toLocaleTimeString("zh-CN", { hour12: false })}）` };
}

export async function saveAdFactsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const projectId = text(fd, "projectId", 64);
  if (!findLocalProject(projectId)) return { error: "项目不存在或为示例项目" };
  const facts = cleanFacts(Object.fromEntries(FACT_KEYS.map((k) => [k, text(fd, k, 300)])));
  const errs = Object.values(factsErrors(facts));
  if (errs.length) return { error: errs.join("；") };
  saveAdFacts(projectId, facts);
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "依据已保存" };
}
