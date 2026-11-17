"use client";

import { askConfirm } from "@/components/ConfirmHost";
import { useActionState } from "react";
import { createProjectAction, deleteProjectAction } from "@/app/actions";
import type { FormState } from "@/lib/types";

const inputClass =
  "mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none";

export function NewProjectForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createProjectAction, {});
  return (
    <form action={action} className="space-y-3">
      <fieldset className="grid grid-cols-2 gap-2 text-sm">
        <legend className="mb-1 text-neutral-400">主要做什么（以后两种都能做）</legend>
        <label className="flex cursor-pointer flex-col rounded-md border border-white/10 p-2 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-400/10">
          <span className="text-white">
            <input type="radio" name="kind" value="series" className="mr-1" />
            长视频
          </span>
          <span className="text-xs text-neutral-500">多集故事，4 集 × 45 秒</span>
        </label>
        <label className="flex cursor-pointer flex-col rounded-md border border-white/10 p-2 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-400/10">
          <span className="text-white">
            <input type="radio" name="kind" value="product" defaultChecked className="mr-1" />
            短视频
          </span>
          <span className="text-xs text-neutral-500">一个产品，多条 15–30 秒竖屏</span>
        </label>
      </fieldset>
      <label className="block text-sm">
        <span className="text-neutral-400">产品名称 *</span>
        <input name="name" required maxLength={60} placeholder="例如：KB002 儿童平衡车" className={inputClass} />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-400">品牌</span>
        <input name="brand" maxLength={60} placeholder="例如：KRIDDO" className={inputClass} />
      </label>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {pending ? "创建中…" : "创建，先填产品资料"}
      </button>
    </form>
  );
}

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteProjectAction}
      onSubmit={async (e) => {
        // 页面里的确认框是异步的：先拦下提交，确认后再交一次
        const form = e.currentTarget;
        if (form.dataset.ok === "1") return;
        e.preventDefault();
        if (await askConfirm(`删除项目「${name}」？数据库记录和已上传的图片都会删除，无法恢复。`)) {
          form.dataset.ok = "1";
          form.requestSubmit();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-400/10">
        删除
      </button>
    </form>
  );
}
