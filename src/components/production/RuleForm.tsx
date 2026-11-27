"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addRuleAction, deleteRuleAction } from "@/app/production-actions";
import { RULE_LAYERS } from "@/lib/rule-layers";
import { askConfirm } from "@/components/ConfirmHost";
import { NeedAdmin, useIsAdmin } from "@/components/admin/AdminContext";

export function RuleForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [layer, setLayer] = useState("product");
  const [level, setLevel] = useState("must");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [global, setGlobal] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const admin = useIsAdmin();
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addRuleAction(projectId, { layer, level, text, source, global });
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
      <label className="flex items-center gap-1 self-center text-xs text-neutral-300" title="勾上后，别的产品项目也按这条检查">
        <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />
        所有产品都适用
      </label>
      <button type="submit" disabled={pending || !text.trim() || !admin} className="rounded-lg bg-amber-400 px-3 py-1.5 font-medium text-black disabled:opacity-40">
        加入规则库
      </button>
      <NeedAdmin className="self-center" />
      {error ? <span className="w-full text-xs text-rose-300">{error}</span> : null}
    </form>
  );
}

export function DeleteRuleButton({ projectId, ruleId }: { projectId: string; ruleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const admin = useIsAdmin();
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending || !admin}
        onClick={async () => {
          if (!(await askConfirm("删除这条规则？以后的镜头不再按它检查。删掉后可以在页面下方「历史版本」里恢复。"))) return;
          start(async () => {
            const r = await deleteRuleAction(projectId, ruleId);
            setErr(r.error ?? "");
            router.refresh();
          });
        }}
        className="text-xs text-neutral-500 underline hover:text-rose-300 disabled:opacity-40"
      >
        删除
      </button>
      <NeedAdmin />
      {err ? <span className="text-xs text-rose-300">{err}</span> : null}
    </span>
  );
}
