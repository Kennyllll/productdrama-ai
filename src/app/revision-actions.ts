"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { addRevision, getRevision, listRevisions, type RevEntity, type Revision } from "@/lib/revisions-repo";
import { dropRow, dropRule, putFamilyRow, putHookRow, putRuleRow } from "@/lib/revert-repo";
import type { Rule } from "@/lib/production-repo";

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });
const NAME: Record<RevEntity, string> = { rule: "规则", hook: "Hook 模板", family: "家庭资料" };

/** 看历史谁都可以（只读） */
export async function listRevisionsAction(entityType: RevEntity, entityId?: string, projectId?: string): Promise<Revision[]> {
  if (!["rule", "hook", "family"].includes(entityType)) return [];
  return listRevisions(entityType, { entityId, projectId });
}

/** 回退到某一版：把那一版的内容再存一次（记成新的一版「回退」），原来的历史都留着 */
export async function revertRevisionAction(revisionId: string, reason = ""): Promise<Result<true>> {
  try {
    const actor = await requireAdmin();
    const r = getRevision(revisionId);
    if (!r || r.data == null) throw new Error("这一版不存在");
    // 「删除」那一版存的是删之前的内容：回退到它 = 恢复
    if (r.entityType === "hook") putHookRow(r.entityId, r.data);
    else if (r.entityType === "family") putFamilyRow(r.entityId, r.data);
    else if (r.projectId) putRuleRow(r.projectId, r.data as Rule);
    else throw new Error("这条规则缺项目信息，不能回退");
    addRevision({ entityType: r.entityType, entityId: r.entityId, projectId: r.projectId, label: r.label, data: r.data, op: "revert", actor: actor.name, reason: `回退到 ${new Date(r.createdAt).toLocaleString("zh-CN")} 的版本${reason.trim() ? `：${reason.trim()}` : ""}` });
    logAction(actor, { projectId: r.projectId, action: `回退${NAME[r.entityType]}`, detail: `${r.label} → ${new Date(r.createdAt).toLocaleString("zh-CN")} 的版本`, refId: r.entityId });
    revalidatePath(r.entityType === "hook" ? "/hooks" : r.entityType === "family" ? "/families" : `/projects/${r.projectId}/rules`);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** 撤掉一个对象（回退到「还没有它」）：只给规则 / Hook / 家庭的「新建」那一版用 */
export async function undoCreateAction(revisionId: string): Promise<Result<true>> {
  try {
    const actor = await requireAdmin();
    const r = getRevision(revisionId);
    if (!r || r.op !== "create") throw new Error("只能撤掉新建的那一版");
    if (r.entityType === "hook") dropRow("hooks", r.entityId);
    else if (r.entityType === "family") dropRow("families", r.entityId);
    else if (r.projectId) dropRule(r.projectId, r.entityId);
    addRevision({ entityType: r.entityType, entityId: r.entityId, projectId: r.projectId, label: r.label, data: r.data, op: "delete", actor: actor.name, reason: "撤掉新建" });
    logAction(actor, { projectId: r.projectId, action: `删除${NAME[r.entityType]}`, detail: `${r.label}（撤掉新建，可再恢复）`, refId: r.entityId });
    revalidatePath(r.entityType === "hook" ? "/hooks" : r.entityType === "family" ? "/families" : `/projects/${r.projectId}/rules`);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
