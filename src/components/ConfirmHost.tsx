"use client";

import { useEffect, useState } from "react";

// 页面里的确认框 / 输入框，替代 window.confirm / window.prompt：浏览器挡掉弹框（“禁止此网页再显示对话框”）时也能用
type Ask = { message: string; input?: string; resolve: (v: string | null) => void };
let push: ((a: Ask) => void) | null = null;

const ask = (message: string, input?: string) => new Promise<string | null>((resolve) => (push ? push({ message, input, resolve }) : resolve(input === undefined ? (window.confirm(message) ? "" : null) : window.prompt(message, input))));

/** 确定 = true，取消 = false */
export const askConfirm = async (message: string) => (await ask(message)) !== null;
/** 点确定返回输入的文字，取消返回 null */
export const askPrompt = (message: string, initial = "") => ask(message, initial);

export function ConfirmHost() {
  const [queue, setQueue] = useState<Ask[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    push = (a) => setQueue((q) => [...q, a]);
    return () => {
      push = null;
    };
  }, []);
  const cur = queue[0];
  useEffect(() => setText(cur?.input ?? ""), [cur]);
  if (!cur) return null;
  const done = (ok: boolean) => {
    cur.resolve(ok ? (cur.input === undefined ? "" : text) : null);
    setQueue((q) => q.slice(1));
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === "Escape" && done(false)}>
      <div className="w-full max-w-lg rounded-xl border border-white/15 bg-neutral-900 p-4 text-sm text-neutral-100 shadow-xl">
        <p className="whitespace-pre-wrap">{cur.message}</p>
        {cur.input !== undefined ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && done(true)}
            className="mt-3 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-white"
          />
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => done(false)} className="rounded border border-white/15 px-3 py-1">
            取消
          </button>
          <button type="button" autoFocus={cur.input === undefined} onClick={() => done(true)} className="rounded bg-amber-400 px-3 py-1 font-medium text-black">
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
