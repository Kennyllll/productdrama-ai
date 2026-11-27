"use client";

import { useState } from "react";
import { DeleteRuleButton, RuleForm } from "@/components/production/RuleForm";
import { Tag } from "@/components/ui";
import type { Decision, Rule } from "@/lib/production-repo";
import { RULE_LAYERS } from "@/lib/rule-layers";

const box = "rounded-xl border border-white/10 bg-neutral-900/70 p-4";
const summary = "cursor-pointer select-none text-sm font-semibold text-white";

export function RulesBrowser({ projectId, rules, decisions, checks }: { projectId: string; rules: Rule[]; decisions: Decision[]; checks: Record<string, string> }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const hit = (s: string) => !t || s.toLowerCase().includes(t);
  const shownRules = rules.filter((r) => hit(`${r.text} ${r.source}`));
  const shownDecisions = decisions.filter((d) => hit(`${d.text} ${d.context}`));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索规则和决定，比如：头盔、车把、字幕"
          className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60"
        />
        <span className="text-xs text-neutral-500">
          {t ? `找到 ${shownRules.length} 条规则、${shownDecisions.length} 条决定` : `共 ${rules.length} 条规则、${decisions.length} 条决定`}
        </span>
      </div>
      <details className={box}>
        <summary className={summary}>＋ 加一条规则</summary>
        <div className="mt-3">
          <RuleForm projectId={projectId} />
        </div>
      </details>
      {RULE_LAYERS.map(([layer, label]) => {
        const rs = shownRules.filter((r) => r.layer === layer);
        if (t && !rs.length) return null;
        return (
          <details key={layer} className={box} open={!!t}>
            <summary className={summary}>
              {label}（{rs.length}）
              <span className="ml-2 text-xs font-normal text-neutral-500">检查方式：{checks[layer]}</span>
            </summary>
            {rs.length === 0 ? <p className="mt-3 text-sm text-neutral-300">这一类还没有规则。</p> : null}
            <ul className="mt-3 space-y-2">
              {rs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Tag tone={r.level === "must" ? "rose" : "amber"}>{r.level === "must" ? "必须修" : "提醒"}</Tag>
                  {r.scope === "global" ? <Tag>所有项目</Tag> : null}
                  <span className="text-neutral-100">{r.text}</span>
                  {r.source ? <span className="text-xs text-neutral-500">来源：{r.source}</span> : null}
                  {r.origin === "user" ? <DeleteRuleButton projectId={projectId} ruleId={r.id} global={r.scope === "global"} /> : null}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {!t || shownDecisions.length ? (
        <details className={box} open={!!t}>
          <summary className={summary}>决定记录（{shownDecisions.length}）</summary>
          <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-neutral-200">
            {shownDecisions.map((d) => (
              <li key={d.id}>
                {d.text}
                {d.context ? <span className="ml-2 text-xs text-neutral-500">{d.context}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
