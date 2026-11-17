"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createShortVideoAction } from "@/app/short-actions";

const inputClass = "mt-1 w-full rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60";

export function NewShortForm({ projectId, templates }: { projectId: string; templates: { id: string; label: string; description: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const t = templates.find((x) => x.id === templateId);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createShortVideoAction(projectId, title, templateId);
          if (r.error || !r.result) return setError(r.error ?? "创建失败");
          router.push(`/projects/${projectId}/shorts/${r.result}`);
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-neutral-400">模板 / 风格</span>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {t ? <p className="text-xs text-neutral-500">{t.description}</p> : null}
      <label className="block text-sm">
        <span className="text-neutral-400">标题（可空）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="例如：圣诞 · 爷爷奶奶送礼" className={inputClass} />
      </label>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button disabled={pending} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
        {pending ? "创建中…" : "新建"}
      </button>
    </form>
  );
}
