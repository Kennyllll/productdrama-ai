"use client";
// Logo 锁定的结果：视频出来后服务器自动做，这里只显示结果，管理员可以改回原版
import { useState } from "react";
import { logoLockAction, setLogoLockOffAction } from "@/app/short-actions";
import type { ShortShot } from "@/lib/shorts";

type Res = Awaited<ReturnType<typeof logoLockAction>>;
const btn = "rounded border border-white/20 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-40";

const NOTE: Record<string, [string, string]> = {
  unchanged: ["text-emerald-300", "Logo 检查：字母全程没变，不用修"],
  "no-logo": ["text-white/50", "画面里 Logo 太小或被挡住，没做 Logo 锁定"],
  "track-lost": ["text-amber-300", "Logo 跟踪不上（镜头晃太多或被挡住），没自动修：请自己看 Logo 字有没有变"],
  "no-tools": ["text-amber-300", "服务器没装 Logo 锁定工具，没自动修：请管理员运行 npm run setup:video"],
  "no-brand-logo": ["text-amber-300", "产品资料里没有 Logo 图，没做 Logo 锁定：先在产品资料上传 Logo"],
  error: ["text-amber-300", "Logo 锁定没做成：请自己看 Logo 字有没有变"],
};

export function LogoLockPanel({ videoId, shot, busy, onResult }: { videoId: string; shot: Pick<ShortShot, "id" | "videoJobId" | "logoLock">; busy: boolean; onResult: (r: Res) => void }) {
  const [run, setRun] = useState(false);
  const l = shot.logoLock?.jobId === shot.videoJobId ? shot.logoLock : undefined;
  const go = async (f: () => Promise<Res>) => {
    setRun(true);
    onResult(await f());
    setRun(false);
  };
  if (!l)
    return (
      <div className="w-full text-xs">
        <button type="button" className={btn} disabled={busy || run} title="检查视频里车上的 Logo 字母有没有变；变了就换回首帧里正确的 Logo。不重新生成，不花钱" onClick={() => go(() => logoLockAction(videoId, shot.id))}>
          {run ? "正在检查 Logo…（约 1 分钟）" : "检查 Logo 字有没有变（免费）"}
        </button>
      </div>
    );
  if (l.status !== "locked") {
    const [tone, text] = NOTE[l.status] ?? NOTE.error;
    return <p className={`w-full text-xs ${tone}`}>{text}{l.note ? `（${l.note}）` : ""}</p>;
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 text-xs">
      {l.off ? (
        <span className="text-amber-300">已改用原版：视频里 Logo 字会变</span>
      ) : (
        <span className="text-emerald-300">✓ 视频里 Logo 字变了，已自动换回首帧里正确的 Logo（预览和出片都用这一版）</span>
      )}
      <a className="text-sky-300 underline" href={`/api/shorts/${shot.videoJobId}?orig=1`} target="_blank" rel="noreferrer">看原版</a>
      <button type="button" className={btn} disabled={busy || run} onClick={() => go(() => setLogoLockOffAction(videoId, shot.id, !l.off))}>
        {l.off ? "改回锁定版" : "锁定版不自然？改用原版"}
      </button>
    </div>
  );
}
