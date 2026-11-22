// 改预算：降低谁都能改；提高要管理员 PIN + 原因；超过默认 1.5 倍再确认一次。每次改动写操作日志
import "server-only";
import { checkBudgetChange } from "@/lib/admin-core";
import { checkPin, currentActor } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { budgetOf, defaultBudget, jobCost, type ShortVideo } from "@/lib/shorts";
import { listJobs, saveShortVideo } from "@/lib/shorts-repo";

export async function applyBudgetChange(v: ShortVideo, usd: number | null, reason: string, pin: string, bigOk: boolean): Promise<void> {
  const spent = listJobs(v.id)
    .filter((j) => !j.isTest)
    .reduce((s, j) => s + jobCost(j), 0);
  const before = budgetOf(v);
  const next = usd === null ? null : Math.round(usd * 100) / 100;
  const after = next ?? defaultBudget(v);
  const verdict = checkBudgetChange({ before, after, defaultUsd: defaultBudget(v), spent }, reason, bigOk);
  if (verdict.error) throw new Error(verdict.error);
  if (verdict.needsAdmin) checkPin(pin);
  v.budgetUsd = next;
  saveShortVideo(v);
  const actor = await currentActor();
  logAction(verdict.needsAdmin ? { ...actor, role: "admin" } : actor, {
    projectId: v.projectId,
    videoId: v.id,
    action: "预算调整",
    detail: `${v.title}：$${before.toFixed(2)} → $${after.toFixed(2)}（${after >= before ? "+" : ""}${(after - before).toFixed(2)}）${next === null ? "，恢复默认" : ""}${reason.trim() ? `；原因：${reason.trim().slice(0, 200)}` : ""}${verdict.big ? "；超过默认 1.5 倍，已再确认" : ""}`,
    usd: Math.round((after - before) * 100) / 100,
  });
}
