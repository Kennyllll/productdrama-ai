"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addRuleAction, deleteRuleAction } from "@/app/production-actions";
import { RULE_LAYERS } from "@/lib/rule-layers";

export function RuleForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [layer, setLayer] = useState("product");
  const [level, setLevel] = useState("must");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRuleAction(projectId, { layer, level, text, source });
          if (r.error) return setError(r.error);
          setText("");
          setSource("");
          setError("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col text-xs text-neutral-400">
        层级
        <select value={layer} onChange={(e) => setLayer(e.target.value)} className="mt-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white">
          {RULE_LAYERS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-neutral-400">
        级别
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white">
          <option value="must">必须修</option>
          <option value="warn">提醒</option>
        </select>
      </label>
      <label className="flex min-w-64 flex-1 flex-col text-xs text-neutral-400">
        规则
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：Jake 的手表戴在左手" className="mt-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white" />
      </label>
      <label className="flex w-48 flex-col text-xs text-neutral-400">
        来源（哪个镜头 / 谁说的）
        <input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 rounded border border-white/15 bg-black/40 px-2 py-1 text-sm text-white" />
      </label>
      <button type="submit" disabled={pending || !text.trim()} className="rounded-lg bg-amber-400 px-3 py-1.5 font-medium text-black disabled:opacity-40">
        加入规则库
      </button>
      {error ? <span className="w-full text-xs text-rose-300">{error}</span> : null}
    </form>
  );
}

export function DeleteRuleButton({ projectId, ruleId }: { projectId: string; ruleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await deleteRuleAction(projectId, ruleId);
          router.refresh();
        })
      }
      className="text-xs text-neutral-500 underline hover:text-rose-300 disabled:opacity-40"
    >
      删除
    </button>
  );
}
