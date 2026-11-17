"use client";

import { useState } from "react";
import { promptPreviewAction } from "@/app/short-actions";

/** 卡片上“查看发给模型的完整提示词”：只读，按已保存的内容现拼 */
export function PromptPreview({ videoId, shotId, dirty }: { videoId: string; shotId: string; dirty: boolean }) {
  const [res, setRes] = useState<{ frame: string; video: string } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setErr("");
    const r = await promptPreviewAction(videoId, shotId);
    setLoading(false);
    if (r.error) setErr(r.error);
    else setRes(r.result ?? null);
  };
  return (
    <details
      className="mt-3 rounded-md border border-white/10 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-300"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="cursor-pointer text-neutral-200">查看发给模型的完整提示词（免费，只能看）</summary>
      <p className="mt-2 text-neutral-400">
        按已保存的内容现拼，和点“生成”时发出去的一样。要改：人的位置、动作去 3D 改；服装、表情、光线改「画面细节」；或者用「按 3D 改写这一镜」写修改意见。
        {dirty ? <span className="text-amber-300"> 你有没保存的改动，这里还没算进去。</span> : null}
      </p>
      <button type="button" className="mt-2 rounded border border-white/15 px-2 py-0.5 hover:bg-white/5" onClick={() => void load()} disabled={loading}>
        {loading ? "拼接中…" : "刷新"}
      </button>
      {err ? <p className="mt-2 text-red-300">{err}</p> : null}
      {res
        ? (
            [
              ["首帧（Sunburst）", res.frame, 5000],
              ["视频（Seedance）", res.video, 0],
            ] as const
          ).map(([label, text, max]) => (
            <div key={label} className="mt-2">
              <div className={max && text.length > max ? "text-red-300" : "text-neutral-400"}>
                {label} · {text.length} 字符{max ? `（上限 ${max}）` : ""}
              </div>
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 font-mono text-[11px] leading-relaxed text-neutral-200">
                {text}
              </pre>
            </div>
          ))
        : null}
    </details>
  );
}
