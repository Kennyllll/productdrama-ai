import Link from "next/link";
import type { ReactNode } from "react";
import type { AiUsage } from "@/lib/ai/models";

export function AiButton({ ready, pending, onClick, children }: { ready: boolean; pending: boolean; onClick: () => void; children: ReactNode }) {
  if (!ready) {
    return (
      <Link
        href="/settings"
        title="尚未配置 DeepSeek API Key"
        className="inline-block rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-sm text-neutral-400 hover:border-amber-400"
      >
        {children} · 先配置 API Key →
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:opacity-50"
    >
      {pending ? "AI 生成中…" : children}
    </button>
  );
}

export function UsageNote({ usage }: { usage: AiUsage }) {
  return (
    <p className="text-xs text-neutral-500">
      本次消耗：输入 {usage.promptTokens} tokens，输出 {usage.completionTokens} tokens
    </p>
  );
}
