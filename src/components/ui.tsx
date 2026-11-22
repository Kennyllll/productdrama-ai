import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-300">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "", aside }: { title?: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-neutral-900/70 p-5 ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-amber-300">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MockBadge({ children = "示例数据" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-xs text-sky-200">
      {children}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "amber" | "rose" | "emerald" }) {
  const tones = {
    neutral: "border-white/15 bg-white/5 text-neutral-300",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/40 bg-rose-400/10 text-rose-200",
    emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

/** 尚未实现的功能：禁用并明确标注，避免虚假成功提示 */
export function LaterButton({ children }: { children: ReactNode; /** 内部任务号，只给开发看，不显示 */ task?: string }) {
  return (
    <button
      type="button"
      disabled
      title="这个功能还没开放"
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-sm text-neutral-500"
    >
      {children}
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-neutral-300">还没开放</span>
    </button>
  );
}

export function PlaceholderFrame({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/15 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.03)_0_10px,transparent_10px_20px)] p-2 text-center text-xs text-neutral-500 ${className}`}
    >
      <span>
        {label}
        <br />
        <span className="text-[10px] text-neutral-600">本地占位 · 非生成结果</span>
      </span>
    </div>
  );
}

export function DemoNotice() {
  return (
    <p className="mb-6 rounded-lg border border-sky-400/30 bg-sky-400/5 px-4 py-2 text-xs text-sky-200">
      演示模式：页面使用本地示例数据，未接入任何 AI / 视频模型 API，也不会产生付费网络调用。编辑内容仅保存在当前页面状态中，刷新后恢复示例。
    </p>
  );
}
