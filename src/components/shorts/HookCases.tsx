"use client";

import { useEffect, useState } from "react";
import { effectDef, HOOK_CASES, type HookEffectId } from "@/lib/hook-effects";

/** 「看真实案例」：右侧抽屉，不盖住页面（没有遮罩），随时关 */
export function HookCases({ effect, name }: { effect?: HookEffectId; name?: string }) {
  const [open, setOpen] = useState(false);
  // 抽屉开着时把页面往左让出抽屉的宽度，右边的按钮不会被盖住
  useEffect(() => {
    if (!open) return;
    const b = document.body.style;
    const old = b.paddingRight;
    b.paddingRight = "380px";
    return () => {
      b.paddingRight = old;
    };
  }, [open]);
  const def = effectDef(effect);
  if (!def) return null;
  const cases = HOOK_CASES[def.id];
  return (
    <>
      <button type="button" className="rounded border border-sky-400/40 px-2 py-0.5 text-xs text-sky-200 hover:border-sky-300" onClick={() => setOpen(!open)}>
        看真实案例（{cases.length}）
      </button>
      {open ? (
        <aside className="fixed right-0 top-0 z-40 flex h-full w-[23.75rem] max-w-[90vw] flex-col border-l border-white/10 bg-neutral-950/95 text-xs text-neutral-300 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 p-3">
            <span className="text-sm font-medium text-white">{name ? `「${name}」` : ""}真实案例</span>
            <button type="button" className="text-neutral-400 hover:text-white" onClick={() => setOpen(false)}>
              关闭 ✕
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            <p className="rounded bg-sky-950/40 p-2 text-sky-100">出片时的效果：{def.look}{def.tip ? `。${def.tip}` : ""}</p>
            {cases.map((c) => (
              <div key={c.img} className="space-y-1 rounded border border-white/10 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-white">{c.brand}</span>
                  {c.adId ? (
                    <a className="text-sky-300 underline" href={`https://www.facebook.com/ads/library/?id=${c.adId}`} target="_blank" rel="noreferrer">
                      广告库
                    </a>
                  ) : null}
                </div>
                <a href={c.img} target="_blank" rel="noreferrer" title="看大图">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.img} alt={c.brand} className="w-full rounded" />
                </a>
                <p className="text-neutral-500">开头 4 秒，每格 0.5 秒（点图看大图） · {c.ran}</p>
                <p>字幕：{c.text}</p>
                <p>画面：{c.motion}</p>
              </div>
            ))}
            <p className="text-neutral-500">来源：Meta 广告库（美国，2026-11 调查）。截帧是别家的广告，只供内部参考。“投了多久”不等于效果数据。</p>
          </div>
        </aside>
      ) : null}
    </>
  );
}
