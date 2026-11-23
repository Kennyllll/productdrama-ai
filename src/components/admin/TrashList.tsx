"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { purgeTrashAction, restoreTrashAction } from "@/app/trash-actions";
import { askConfirm } from "@/components/ConfirmHost";
import { NeedAdmin, useIsAdmin } from "@/components/admin/AdminContext";
import type { TrashItem } from "@/lib/trash-repo";

const KIND: Record<string, string> = { shots: "镜头 / 开头", frame: "首帧", video: "视频", short_video: "整条短视频", portrait: "家庭定妆照草稿" };

export function TrashList({ items, projectNames }: { items: TrashItem[]; projectNames: Record<string, string> }) {
  const router = useRouter();
  const admin = useIsAdmin();
  const [msg, setMsg] = useState<{ id: string; text: string; err: boolean } | null>(null);
  const [pending, start] = useTransition();
  const restore = (t: TrashItem) =>
    start(async () => {
      const r = await restoreTrashAction(t.id);
      setMsg({ id: t.id, text: r.error ?? r.result ?? "已恢复", err: !!r.error });
      if (!r.error) router.refresh();
    });
  const purge = async (t: TrashItem) => {
    if (!(await askConfirm(`永久删除「${t.label}」？\n\n会丢掉 $${t.usd.toFixed(2)} 的结果，删了就不能恢复。费用记录和操作日志会保留。`))) return;
    start(async () => {
      const r = await purgeTrashAction(t.id);
      setMsg({ id: t.id, text: r.error ?? "已永久删除", err: !!r.error });
      if (!r.error) router.refresh();
    });
  };
  const gone = msg && !msg.err && !items.some((t) => t.id === msg.id);
  const banner = gone ? <p className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{msg.text}</p> : null;
  if (!items.length)
    return (
      <>
        {banner}
        <p className="rounded-xl border border-white/10 p-6 text-sm text-neutral-400">回收站是空的。</p>
      </>
    );
  return (
    <>
    {banner}
    {admin ? null : (
      <p className="mb-3 text-xs text-neutral-500">
        永久删除只有管理员能做。<NeedAdmin />
      </p>
    )}
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-neutral-900/70 px-4 py-3 text-sm">
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-neutral-200">{KIND[t.kind] ?? t.kind}</span>
          <span className="min-w-0 flex-1">
            <span className="text-white">{t.label}</span>
            <span className="ml-2 text-xs text-neutral-500" suppressHydrationWarning>
              {t.projectId ? `${projectNames[t.projectId] ?? ""} · ` : ""}
              {new Date(t.createdAt).toLocaleString("zh-CN")} · {t.actor}
            </span>
          </span>
          <span className={`text-xs ${t.usd > 0 ? "text-amber-300" : "text-neutral-500"}`}>价值 ${t.usd.toFixed(2)}</span>
          <button type="button" disabled={pending} onClick={() => restore(t)} className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-medium text-black disabled:opacity-40">
            恢复
          </button>
          {admin ? (
            <button type="button" disabled={pending} onClick={() => purge(t)} className="text-xs text-neutral-500 hover:text-rose-300">
              永久删除
            </button>
          ) : null}
          {msg?.id === t.id ? <span className={`w-full text-xs ${msg.err ? "text-rose-300" : "text-emerald-300"}`}>{msg.text}</span> : null}
        </li>
      ))}
    </ul>
    </>
  );
}
