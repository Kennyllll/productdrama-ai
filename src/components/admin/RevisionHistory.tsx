"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { listRevisionsAction, revertRevisionAction } from "@/app/revision-actions";
import { askConfirm } from "@/components/ConfirmHost";
import { NeedAdmin, useIsAdmin } from "@/components/admin/AdminContext";
import type { RevEntity, Revision } from "@/lib/revisions-repo";

const OP: Record<string, string> = { create: "新建", update: "修改", delete: "删除", revert: "回退" };
const NAME: Record<RevEntity, string> = { rule: "规则", hook: "Hook 模板", family: "家庭资料" };

function summary(type: RevEntity, d: unknown): string {
  const x = (d ?? {}) as Record<string, unknown>;
  if (type === "rule") return `${x.level === "warn" ? "提醒" : "必须修"}：${String(x.text ?? "")}`;
  if (type === "hook") return `${String(x.name ?? "")} · ${String(x.seconds ?? "")} 秒 · ${(x.fields as unknown[] | undefined)?.length ?? 0} 个属性 · 字幕「${String(x.caption ?? "")}」`;
  const ms = (x.members as { name?: string; age?: number }[] | undefined) ?? [];
  return `${String(x.name ?? "")} · ${ms.map((m) => `${m.name ?? ""} ${m.age ?? ""} 岁`).join("、")}`;
}

/** 历史版本：谁、什么时候、改成了什么；管理员可以回退（回退会再记一版，不会抹掉历史） */
export function RevisionHistory({ entityType, projectId }: { entityType: RevEntity; projectId?: string }) {
  const admin = useIsAdmin();
  const router = useRouter();
  const [list, setList] = useState<Revision[] | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () => start(async () => setList(await listRevisionsAction(entityType, undefined, projectId)));
  const revert = async (r: Revision) => {
    if (!(await askConfirm(`把「${r.label}」改回 ${new Date(r.createdAt).toLocaleString("zh-CN")} 的样子？\n\n${summary(entityType, r.data)}\n\n现在的内容不会丢，会留在历史里。`))) return;
    start(async () => {
      const x = await revertRevisionAction(r.id);
      setMsg({ id: r.id, text: x.error ?? "已回退" });
      if (!x.error) {
        setList(await listRevisionsAction(entityType, undefined, projectId));
        router.refresh();
      }
    });
  };
  return (
    <details className="mt-6 rounded-xl border border-white/10 bg-neutral-900/70 p-4" onToggle={(e) => (e.currentTarget.open ? load() : undefined)}>
      <summary className="cursor-pointer select-none text-sm font-semibold text-white">
        {NAME[entityType]}历史版本 <span className="ml-1 text-xs font-normal text-neutral-500">每次改动、删除都留一版，删错了也能从这里恢复</span>
      </summary>
      {!list ? <p className="mt-2 text-xs text-neutral-500">读取中…</p> : !list.length ? <p className="mt-2 text-xs text-neutral-500">还没有改动记录（从现在起的改动会记在这里）。</p> : null}
      <ul className="mt-2 space-y-1 text-xs">
        {list?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-white/5 py-1">
            <span className="w-36 text-neutral-500">{new Date(r.createdAt).toLocaleString("zh-CN")}</span>
            <span className={`rounded px-1.5 ${r.op === "delete" ? "bg-rose-500/20 text-rose-200" : r.op === "revert" ? "bg-sky-500/20 text-sky-200" : "bg-white/10 text-neutral-200"}`}>{OP[r.op]}</span>
            <span className="text-neutral-400">{r.actor}</span>
            <span className="min-w-0 flex-1 truncate text-neutral-200" title={summary(entityType, r.data)}>
              {summary(entityType, r.data)}
              {r.reason ? <span className="ml-1 text-neutral-500">（{r.reason}）</span> : null}
            </span>
            <button type="button" disabled={pending || !admin || r.data == null} onClick={() => revert(r)} className="rounded border border-white/15 px-2 py-0.5 text-neutral-200 hover:bg-white/10 disabled:opacity-40">
              {r.op === "delete" ? "恢复这版" : "回退到这版"}
            </button>
            <NeedAdmin />
            {msg?.id === r.id ? <span className={msg.text === "已回退" ? "text-emerald-300" : "text-rose-300"}>{msg.text}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
