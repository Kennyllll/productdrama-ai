"use server";

import { revalidatePath } from "next/cache";
import { cleanHookData } from "@/lib/hooks";
import { createHook, deleteHook, getHook, saveHook } from "@/lib/hooks-repo";
import { requireAdmin } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { addRevision } from "@/lib/revisions-repo";

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });
const dataOf = (id: string) => {
  const h = getHook(id);
  if (!h) return null;
  const { id: _i, updatedAt: _u, ...d } = h;
  void _i;
  void _u;
  return d;
};

/** Hook 模板只有管理员能改；每次改动留一版，能回退 */
export async function saveHookAction(id: string | null, data: unknown): Promise<Result<string>> {
  try {
    const actor = await requireAdmin();
    const h = cleanHookData(data);
    if (!h) return { error: "Hook 名字不能为空" };
    if (id) {
      const before = dataOf(id);
      if (!before) return { error: "Hook 不存在" };
      saveHook(id, h);
      addRevision({ entityType: "hook", entityId: id, label: h.name, data: dataOf(id), op: "update", actor: actor.name, before });
    } else {
      id = createHook(h);
      addRevision({ entityType: "hook", entityId: id, label: h.name, data: dataOf(id), op: "create", actor: actor.name });
    }
    logAction(actor, { action: "修改 Hook 模板", detail: h.name, refId: id });
    revalidatePath("/hooks");
    return { result: id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteHookAction(id: string): Promise<Result<true>> {
  try {
    const actor = await requireAdmin();
    const before = dataOf(id);
    if (!before || !deleteHook(id)) return { error: "Hook 不存在" };
    addRevision({ entityType: "hook", entityId: id, label: before.name, data: before, op: "delete", actor: actor.name });
    logAction(actor, { action: "删除 Hook 模板", detail: `${before.name}（可在历史版本里恢复）`, refId: id });
    revalidatePath("/hooks");
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
