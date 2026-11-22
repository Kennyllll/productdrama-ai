/** 页面加载时的灰色占位：形状和真实卡片一致，点了链接马上看到变化 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} />;
}

export function PageSkeleton({ cards = 3, label = "正在打开…" }: { cards?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-6xl px-6 py-8">
      <span className="sr-only">{label}</span>
      <div className="mb-6 border-b border-white/10 pb-5">
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-neutral-900/70 p-5">
              <SkeletonBlock className="h-5 w-40" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, k) => (
                  <SkeletonBlock key={k} className="h-12" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-5">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="mt-4 h-9" />
          <SkeletonBlock className="mt-3 h-9" />
          <SkeletonBlock className="mt-3 h-9 w-28" />
        </div>
      </div>
    </div>
  );
}

/** 短视频工作台：顶部预算条 + 镜头卡网格 */
export function StudioSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">正在打开这条视频…</span>
      <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <SkeletonBlock className="h-6 w-56" />
        <div className="mt-3 flex gap-3">
          <SkeletonBlock className="h-8 w-28" />
          <SkeletonBlock className="h-8 w-28" />
          <SkeletonBlock className="h-8 w-28" />
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-neutral-900/70 p-4">
        <SkeletonBlock className="h-5 w-24" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="aspect-[9/16]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 3D 编辑器按需加载时的占位 */
export function ThreeSkeleton({ label = "3D 加载中…（第一次约 1–3 秒）" }: { label?: string }) {
  return (
    <div role="status" className="flex h-[480px] items-center justify-center rounded-xl border border-white/10 bg-neutral-900/70 text-sm text-neutral-300">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
      {label}
    </div>
  );
}
