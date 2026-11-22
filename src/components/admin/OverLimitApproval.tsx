"use client";

import { useState, useTransition } from "react";
import { approveOverLimitAction } from "@/app/admin-actions";

const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-amber-400/60";

/** 超次数 / 超预算：管理员当场输 PIN + 写原因放行这一次。放行后才算勾上 */
export function OverLimitApproval({ videoId, shotId, kind, usd, approved, onApproved }: { videoId: string; shotId: string; kind: string; usd: number; approved: boolean; onApproved: (ok: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (approved) return <p className="text-xs text-emerald-300">管理员已放行这一次（{`$${usd.toFixed(2)}`}，15 分钟内有效）。已记进操作日志。</p>;
  const why = reason.trim().length < 4 ? "先写原因（至少 4 个字）" : !pin ? "需要管理员 PIN" : "";
  return (
    <div className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
      <p>超出默认次数或预算：需要管理员放行这一次（{`$${usd.toFixed(2)}`}）</p>
      <div className="flex flex-wrap items-center gap-1">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么要超限？" className={`${field} w-44`} aria-label="超限原因" />
        <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="管理员 PIN" type="password" inputMode="numeric" autoComplete="off" className={`${field} w-24`} aria-label="管理员 PIN" />
        <button
          type="button"
          disabled={pending || !!why}
          className="rounded-md border border-amber-300/50 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-40"
          onClick={() =>
            start(async () => {
              const r = await approveOverLimitAction(videoId, shotId, kind, usd, reason, pin);
              setPin("");
              setMsg(r.error ?? "");
              onApproved(!r.error);
            })
          }
        >
          管理员放行
        </button>
        {why ? <span className="text-amber-300/80">{why}</span> : null}
        {msg ? <span className="text-rose-300">{msg}</span> : null}
      </div>
    </div>
  );
}
