"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Msg = { tone: "ok" | "err"; text: string } | null;

/** 记住最后点的按钮（全页一个监听，不用每个按钮改代码） */
let lastBtn: HTMLElement | null = null;
if (typeof document !== "undefined")
  document.addEventListener("pointerdown", (e) => {
    const b = (e.target as Element | null)?.closest?.("button,[role=button],a") as HTMLElement | null;
    if (b) lastBtn = b;
  }, true);

/** 按钮下方的位置；按钮看不见（已卸载 / 滚出屏幕）就回落到屏幕底部 */
export function anchorPos(r: { top: number; bottom: number; left: number; width: number } | null, vw: number, vh: number): { top: number; left: number } | null {
  if (!r || r.width === 0 || r.bottom < 0 || r.top > vh) return null;
  const left = Math.min(Math.max(8, r.left), Math.max(8, vw - 368));
  return { top: r.bottom + 6, left };
}

/**
 * 处理中 / 成功 / 失败提示贴在刚点的按钮下面。
 * 成功 4 秒后自己消失；失败一直留着，点 × 才关。
 */
export function NearToast({ msg, busy, onClose }: { msg: Msg; busy: boolean; onClose: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const show = busy || !!msg;
  useLayoutEffect(() => {
    if (!show) return;
    if (busy || !anchor.current?.isConnected) anchor.current = lastBtn;
    const place = () => {
      const a = anchor.current;
      setPos(a?.isConnected ? anchorPos(a.getBoundingClientRect(), window.innerWidth, window.innerHeight) : null);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [show, busy, msg]);
  useEffect(() => {
    if (msg?.tone !== "ok" || busy) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [msg, busy, onClose]);
  if (!show) return null;
  const tone = busy
    ? "border-sky-400/40 bg-neutral-900 text-sky-100"
    : msg!.tone === "err"
      ? "border-rose-400/50 bg-neutral-900 text-rose-200"
      : "border-emerald-400/40 bg-neutral-900 text-emerald-200";
  return (
    <div
      role={msg?.tone === "err" ? "alert" : "status"}
      aria-live="polite"
      style={pos ? { top: pos.top, left: pos.left } : undefined}
      className={`fixed z-50 flex max-w-[360px] items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg shadow-black/60 ${tone} ${pos ? "" : "bottom-6 left-1/2 -translate-x-1/2"}`}
    >
      {busy ? (
        <>
          <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
          <span>处理中…</span>
        </>
      ) : (
        <>
          <span>{msg!.tone === "err" ? "⚠ " : "✓ "}{msg!.text}</span>
          <button onClick={onClose} aria-label="关闭提示" className="-mr-1 shrink-0 px-1 text-neutral-400 hover:text-white">
            ×
          </button>
        </>
      )}
    </div>
  );
}
