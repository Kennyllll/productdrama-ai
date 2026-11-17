"use client";

import { useState } from "react";

/** 改写草稿下面：用户用大白话提修改意见，按意见重新生成 */
export function DraftFeedback({ busy, needs3d, onSubmit }: { busy: boolean; needs3d: string[]; onSubmit: (feedback: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      {needs3d.length ? (
        <div className="rounded border border-amber-400/40 bg-amber-400/5 p-2 text-amber-200">
          <p>这些意见和 3D 对不上，文字先按 3D 写，要你去 3D 里改：</p>
          <ul className="list-disc pl-4">
            {needs3d.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="block text-neutral-400">
        你的修改意见（大白话就行，比如“小孩用食指指向屏幕下方，另一只手扶着车把”）
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
        />
      </label>
      <button
        className="rounded border border-sky-400/50 px-2 py-1 text-xs text-sky-200 hover:bg-white/10 disabled:opacity-40"
        disabled={busy || text.trim().length < 2}
        onClick={() => onSubmit(text.trim())}
      >
        {busy ? "重新生成中…" : "按意见重新生成（DeepSeek，不到 $0.01）"}
      </button>
    </div>
  );
}
