"use client";

// 导出区：正文没齐 / 数字没依据时不能当正式成片导出，可以先导出预览；合规警告在按钮旁汇总。
import Link from "next/link";
import { useState } from "react";
import type { ExportReport } from "@/lib/export-check";
import { formalExportError } from "@/lib/export-check";

const primary = "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-neutral-200 hover:border-amber-400/60 disabled:cursor-not-allowed disabled:opacity-40";

export function ExportGate({
  videoId,
  projectId,
  report,
  busy,
  hasAccepted,
  count,
  run,
}: {
  videoId: string;
  projectId: string;
  report: ExportReport;
  busy: boolean;
  hasAccepted: boolean;
  count: number;
  /** 调导出；返回错误文字，空 = 成功 */
  run: (preview: boolean) => Promise<string>;
}) {
  const [err, setErr] = useState("");
  const [previewAt, setPreviewAt] = useState<string | null>(null);
  const why = formalExportError(report);
  const blocked = !!why || !hasAccepted;
  const go = async (preview: boolean) => {
    const e = await run(preview);
    setErr(e);
    if (!e && preview) setPreviewAt(new Date().toISOString());
  };
  return (
    <div className="space-y-2">
      {report.gaps.length ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          正文还有 {report.gaps.length} 镜没好：{report.gaps.map((g) => `「${g.beat}」${g.why}`).join("；")}。
        </p>
      ) : null}
      {report.blocks.length ? (
        <div className="rounded-md bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          <p>这些数字没有依据，不能正式导出（<Link href={`/projects/${projectId}/product#ad-facts`} className="underline underline-offset-4">去产品资料第 5 步填依据</Link>）：</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {report.blocks.map((b, i) => (
              <li key={i}>
                {b.where}「{b.hit}」：{b.why}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.warns.length ? (
        <details className="rounded-md bg-amber-400/5 px-3 py-2 text-sm text-amber-200" open>
          <summary className="cursor-pointer">导出前看一下：{report.warns.length} 处说法有风险（不拦，自己判断）</summary>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-100/90">
            {report.warns.map((w, i) => (
              <li key={i}>
                {w.where}「{w.hit}」：{w.why}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button className={primary} disabled={busy || blocked} onClick={() => go(false)}>
          正式导出 {count} 个版本
        </button>
        {report.gaps.length || report.blocks.length ? (
          <button className={ghost} disabled={busy || !hasAccepted} onClick={() => go(true)} title="只用已采用的镜头拼一条，看效果用，不能发布">
            导出预览{report.gaps.length ? `（缺 ${report.gaps.length} 镜）` : ""}
          </button>
        ) : null}
        <span className="text-xs text-neutral-400">{!hasAccepted ? "还没有采用的镜头，先采用至少一镜" : why ? "正式成片要先补齐上面的内容" : ""}</span>
        {err ? <span className="text-xs text-rose-300">{err}</span> : null}
      </div>
      {previewAt ? (
        <figure>
          <figcaption className="mb-1 text-xs text-amber-300">预览（不完整，不能当成片发布）</figcaption>
          <video src={`/api/shorts/${videoId}?preview=1&t=${encodeURIComponent(previewAt)}`} controls className="max-h-[35rem] rounded-lg" />
        </figure>
      ) : null}
    </div>
  );
}
