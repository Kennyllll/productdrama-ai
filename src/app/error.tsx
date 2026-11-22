"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 页面出错：不显示英文堆栈，只给两个能点的出路 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="mx-auto max-w-xl px-6 py-16 text-center">
      <p className="text-xl font-semibold text-white">这个页面出错了</p>
      <p className="mt-2 text-sm text-neutral-300">你做的修改已经保存的不会丢。先点「重新加载」；还不行就回项目中心。</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300">
          重新加载
        </button>
        <Link href="/dashboard" className="rounded-lg border border-white/20 px-4 py-2 text-sm text-neutral-200 hover:bg-white/10">
          回项目中心
        </Link>
      </div>
      {error.digest ? <p className="mt-6 text-xs text-neutral-400">出错编号：{error.digest}（发给管理员）</p> : null}
    </div>
  );
}
