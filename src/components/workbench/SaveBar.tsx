"use client";

import type { ReactNode } from "react";
import type { FormState } from "@/lib/types";

export function SaveBar({
  dirty,
  pending,
  status,
  onSave,
  extra,
}: {
  dirty: boolean;
  pending: boolean;
  status: FormState;
  onSave: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-t-xl border-t border-white/10 bg-neutral-950/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onSave}
        disabled={pending || !dirty}
        className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-40"
      >
        {pending ? "保存中…" : "保存"}
      </button>
      <span role="status" className="text-sm">
        {status.error ? (
          <span className="text-rose-300">{status.error}</span>
        ) : dirty ? (
          <span className="text-amber-200">有未保存的修改</span>
        ) : status.ok ? (
          <span className="text-emerald-300">{status.ok}</span>
        ) : (
          <span className="text-neutral-500">已与本机数据库同步</span>
        )}
      </span>
      {extra}
    </div>
  );
}
