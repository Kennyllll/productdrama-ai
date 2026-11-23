"use client";

import { useEffect, useState } from "react";
import { listExportVersionsAction } from "@/app/export-actions";
import type { ExportVersion } from "@/lib/export-versions-repo";

const usd = (n: number) => `$${n.toFixed(2)}`;

/** 导出区：每次导出的成片版本（不会被后面的导出覆盖） */
export function ExportHistory({ videoId, refreshKey }: { videoId: string; refreshKey: string | null }) {
  const [list, setList] = useState<ExportVersion[] | null>(null);
  useEffect(() => {
    let live = true;
    void listExportVersionsAction(videoId).then((r) => live && setList(r));
    return () => {
      live = false;
    };
  }, [videoId, refreshKey]);
  if (!list) return null;
  return (
    <details className="mt-4 rounded-lg border border-white/10 p-3 text-sm" open={list.length > 0 && list.length <= 3}>
      <summary className="cursor-pointer select-none font-semibold text-white">历史版本（{list.length}）</summary>
      {!list.length ? <p className="mt-2 text-xs text-neutral-500">还没导出过。每导出一次都会在这里多一版，旧版不会被覆盖。</p> : null}
      <ul className="mt-2 space-y-2">
        {list.map((x) => (
          <li key={x.id} className="rounded-md border border-white/5 bg-black/30 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-white">第 {x.n} 版</span>
              <span className="text-neutral-400" suppressHydrationWarning>{new Date(x.createdAt).toLocaleString("zh-CN")}</span>
              <span className="text-neutral-400">操作人：{x.actor}</span>
              <span className="text-neutral-300">开头：{x.snapshot.hook?.name ?? "无"}</span>
              <span className="text-neutral-300">
                {x.snapshot.shots.length} 镜 · {x.snapshot.seconds} 秒 · 字幕{x.snapshot.captions ? "开" : "关"}
              </span>
              <span className="text-emerald-300">这版素材 {usd(x.snapshot.mediaUsd)}</span>
              <a className="ml-auto text-sky-300 underline" href={`/api/shorts/${x.videoId}?version=${x.id}`}>
                下载
              </a>
            </div>
            <details className="mt-1 text-xs text-neutral-400">
              <summary className="cursor-pointer select-none">看用了哪些镜头</summary>
              <table className="mt-1 w-full text-left">
                <thead className="text-neutral-500">
                  <tr>
                    <th>镜头</th>
                    <th>首帧版本</th>
                    <th>视频版本</th>
                    <th>用几秒</th>
                    <th>字幕</th>
                    <th className="text-right">费用</th>
                  </tr>
                </thead>
                <tbody>
                  {x.snapshot.shots.map((s) => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="py-0.5 text-neutral-200">{s.label}</td>
                      <td title={s.frameModel}>{s.frameJobId?.slice(0, 8) ?? "—"}</td>
                      <td title={s.videoModel}>{s.videoJobId?.slice(0, 8) ?? "—"}</td>
                      <td>{s.useSeconds}s</td>
                      <td className="max-w-[16rem] truncate" title={s.caption}>{s.caption || "—"}</td>
                      <td className="text-right">{usd(s.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1">价格依据：{x.snapshot.priceBasis}。导出时这条视频一共已花 {usd(x.snapshot.videoSpentUsd)}（含返工）。</p>
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
