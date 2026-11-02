"use client";

import { useActionState } from "react";
import { createProjectAction, deleteProjectAction } from "@/app/actions";
import type { FormState } from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";

export function NewProjectForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createProjectAction, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="text-neutral-400">项目名称 *</span>
        <input name="name" required maxLength={60} placeholder="例如：滑板车夏日短剧" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-400">品牌</span>
        <input name="brand" maxLength={60} placeholder="例如：KRIDDO" className={inputClass} />
      </label>
      <p className="text-xs text-neutral-500">固定为 4 集 × 45 秒。项目保存在本机，不会上传。</p>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {pending ? "创建中…" : "创建并进入产品工作台"}
      </button>
    </form>
  );
}

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteProjectAction}
      onSubmit={(e) => {
        if (!window.confirm(`删除项目「${name}」？数据库记录和已上传的图片都会删除，无法恢复。`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-400/10">
        删除
      </button>
    </form>
  );
}
