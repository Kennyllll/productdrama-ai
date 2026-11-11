"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DEMO_PROJECT_ID, demoProject, localStepStatus } from "@/lib/mock/demo";
import { stepHref, workflowSteps } from "@/lib/navigation";

const statusDot = {
  done: "bg-emerald-400",
  in_progress: "bg-amber-400",
  todo: "bg-neutral-600",
} as const;

const productionTools = [
  ["shots", "镜头卡"],
  ["timeline", "时间线"],
  ["set", "3D 布景"],
  ["ledger", "费用账本"],
  ["rules", "规则库"],
] as const;

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-amber-400/15 text-amber-200" : "text-neutral-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? DEMO_PROJECT_ID;
  const isDemo = projectId === DEMO_PROJECT_ID;
  const project = {
    id: projectId,
    name: isDemo ? demoProject.name : "本地项目",
    stepStatus: isDemo ? demoProject.stepStatus : localStepStatus,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 lg:flex">
      <aside className="border-b border-white/10 bg-black/40 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/" className="block">
            <span className="text-lg font-bold tracking-tight text-white">
              Product<span className="text-amber-400">Drama</span> AI
            </span>
            <span className="block text-[11px] text-neutral-500">产品电影级连续短剧工作台</span>
          </Link>
        </div>
        <nav aria-label="主导航" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <span aria-hidden>▦</span> 项目中心
          </NavLink>
          <NavLink href="/easter-eggs" active={pathname.startsWith("/easter-eggs")}>
            彩蛋角色库
          </NavLink>
          <NavLink href="/settings" active={pathname.startsWith("/settings")}>
            模型设置
          </NavLink>
          <p className="hidden px-3 pb-1 pt-4 text-[11px] uppercase tracking-wider text-neutral-500 lg:block">
            当前项目 · {project.name}
          </p>
          {workflowSteps.map((step, i) => {
            const href = stepHref(project.id, step.key);
            return (
              <NavLink key={step.key} href={href} active={pathname === href}>
                <span className={`h-2 w-2 rounded-full ${statusDot[project.stepStatus[step.key]]}`} aria-hidden />
                <span className="text-neutral-500">{i + 1}.</span> {step.label}
              </NavLink>
            );
          })}
          {!isDemo ? (
            <>
              <p className="hidden px-3 pb-1 pt-4 text-[11px] uppercase tracking-wider text-neutral-500 lg:block">制作工具</p>
              {productionTools.map(([key, label]) => {
                const href = `/projects/${project.id}/${key}`;
                return (
                  <NavLink key={key} href={href} active={pathname === href}>
                    {label}
                  </NavLink>
                );
              })}
            </>
          ) : null}
        </nav>
        <div className="hidden px-5 pt-6 text-[11px] leading-relaxed text-neutral-500 lg:block">
          <p><span className="text-emerald-400">●</span> 已完成（示例）</p>
          <p><span className="text-amber-400">●</span> 进行中（示例）</p>
          <p><span className="text-neutral-600">●</span> 未开始</p>
          <p className="mt-3">仅本地运行 · 未接入 AI</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
