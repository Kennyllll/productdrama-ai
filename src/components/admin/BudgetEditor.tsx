"use client";

import { useState } from "react";
import { BUDGET_BIG_RATIO } from "@/lib/admin-labels";

const usd = (n: number) => `$${n.toFixed(2)}`;
const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-amber-400/60";
const btn = "rounded-md border border-white/15 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-40";

/** 调整预算：降低直接改；提高要写原因 + 管理员 PIN；超过默认 1.5 倍再勾一次 */
export function BudgetEditor({ budget, defaultUsd, custom, busy, onSet }: { budget: number; defaultUsd: number; custom: boolean; busy: boolean; onSet: (usd: number | null, reason: string, pin: string, bigOk: boolean) => void }) {
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [bigOk, setBigOk] = useState(false);
  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(n) && n >= 0;
  const raise = valid && n > budget + 1e-9;
  const big = raise && n > defaultUsd * BUDGET_BIG_RATIO + 1e-9;
  const why = !valid ? "先填新预算" : raise && reason.trim().length < 4 ? "提高预算要写原因（至少 4 个字）" : raise && !pin ? "提高预算需要管理员 PIN" : big && !bigOk ? "超过默认 1.5 倍：先勾选再确认" : "";
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="新预算 $" inputMode="decimal" className={`${field} w-24`} aria-label="新预算" />
        {raise ? (
          <>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么要提高？" className={`${field} w-40`} aria-label="提高预算的原因" />
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="管理员 PIN" type="password" inputMode="numeric" autoComplete="off" className={`${field} w-24`} aria-label="管理员 PIN" />
            <a href="/settings" className="text-[11px] text-amber-300 underline">还没有 PIN？到「设置 → 身份」设一个</a>
          </>
        ) : null}
        <button
          className={btn}
          disabled={busy || !!why}
          onClick={() => {
            onSet(n, reason, pin, bigOk);
            setPin("");
          }}
        >
          {raise ? "管理员确认提高" : "调整预算"}
        </button>
        {custom ? (
          <button className={btn} disabled={busy} onClick={() => onSet(null, reason || "恢复默认预算", pin, true)}>
            恢复默认 {usd(defaultUsd)}
          </button>
        ) : null}
        {why && draft ? <span className="text-xs text-amber-300">{why}</span> : null}
      </div>
      {raise ? (
        <p className="text-xs text-neutral-400">
          {usd(budget)} → {usd(n)}（多 {usd(n - budget)}）。会记进操作日志：谁、什么时候、改了多少、为什么。
        </p>
      ) : null}
      {big ? (
        <label className="flex items-center gap-1 text-xs text-rose-300">
          <input type="checkbox" checked={bigOk} onChange={(e) => setBigOk(e.target.checked)} />
          新预算超过默认 {usd(defaultUsd)} 的 {BUDGET_BIG_RATIO} 倍，我确认要这么多
        </label>
      ) : null}
    </div>
  );
}
