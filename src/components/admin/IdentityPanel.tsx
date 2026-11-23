"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminLoginAction, adminLogoutAction, setAdminPinAction, setOperatorNameAction } from "@/app/admin-actions";
import { useActor } from "@/components/admin/AdminContext";
import { ROLE_LABEL } from "@/lib/admin-labels";

const field = "rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-400/60";
const btn = "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40";
const ghost = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-40";

/** 设置 → 身份：新手 / 管理员切换、设 PIN、填操作人名字 */
export function IdentityPanel() {
  const a = useActor();
  const router = useRouter();
  const [name, setName] = useState(a.name === "新手" || a.name === "管理员" ? "" : a.name);
  const [pin, setPin] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState<{ at: string; text: string; err?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const run = (at: string, fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg({ at, text: r.error ?? ok, err: !!r.error });
      setPin("");
      setOldPin("");
      setNewPin("");
      if (!r.error) router.refresh();
    });
  const note = (at: string) => (msg?.at === at ? <span className={`text-xs ${msg.err ? "text-rose-300" : "text-emerald-300"}`}>{msg.text}</span> : null);
  const pinOk = /^\d{4,12}$/.test(newPin);
  return (
    <section id="identity" className="rounded-xl border border-amber-400/30 bg-neutral-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">身份</h2>
        <span className={`rounded-full px-3 py-0.5 text-xs ${a.role === "admin" ? "bg-amber-400 text-black" : "bg-white/10 text-neutral-200"}`}>
          现在是：{ROLE_LABEL[a.role]}{a.name && a.name !== ROLE_LABEL[a.role] ? `（${a.name}）` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">新手能做视频、看所有东西；模型 Key、预算上限、规则库、Hook 模板、家庭库只有管理员能改。管理员 4 小时后自动退回新手。</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字（记进操作日志）" maxLength={20} className={`${field} w-56`} aria-label="操作人名字" />
        <button className={ghost} disabled={pending} onClick={() => run("name", () => setOperatorNameAction(name), "名字已保存")}>
          保存名字
        </button>
        {note("name")}
      </div>

      {!a.pinSet ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="设一个管理员 PIN（4–12 位数字）" type="password" inputMode="numeric" autoComplete="new-password" className={`${field} w-64`} aria-label="新管理员 PIN" />
          <button className={btn} disabled={pending || !pinOk} onClick={() => run("set", () => setAdminPinAction("", newPin), "PIN 已设好，现在是管理员")}>
            设管理员 PIN
          </button>
          {!pinOk && newPin ? <span className="text-xs text-amber-300">要 4–12 位数字</span> : null}
          {note("set")}
          <p className="w-full text-xs text-amber-300">还没设管理员 PIN：现在谁都不是管理员。请平台负责人先设一个，别告诉新手。</p>
        </div>
      ) : a.role === "novice" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="管理员 PIN" type="password" inputMode="numeric" autoComplete="off" className={`${field} w-40`} aria-label="管理员 PIN" onKeyDown={(e) => e.key === "Enter" && pin && run("login", () => adminLoginAction(pin), "已切换到管理员")} />
          <button className={btn} disabled={pending || !pin} onClick={() => run("login", () => adminLoginAction(pin), "已切换到管理员")}>
            切换到管理员
          </button>
          {!pin ? <span className="text-xs text-neutral-500">先输 PIN</span> : null}
          {note("login")}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button className={ghost} disabled={pending} onClick={() => run("logout", adminLogoutAction, "已切换回新手")}>
              切换回新手
            </button>
            {note("logout")}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-xs text-neutral-400">改管理员 PIN</summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="旧 PIN" type="password" inputMode="numeric" autoComplete="off" className={`${field} w-28`} aria-label="旧 PIN" />
              <input value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="新 PIN（4–12 位数字）" type="password" inputMode="numeric" autoComplete="new-password" className={`${field} w-48`} aria-label="新 PIN" />
              <button className={btn} disabled={pending || !oldPin || !pinOk} onClick={() => run("change", () => setAdminPinAction(oldPin, newPin), "PIN 已改，其他浏览器的管理员登录都失效了")}>
                改 PIN
              </button>
              {!oldPin ? <span className="text-xs text-neutral-500">先输旧 PIN</span> : !pinOk ? <span className="text-xs text-amber-300">新 PIN 要 4–12 位数字</span> : null}
              {note("change")}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
