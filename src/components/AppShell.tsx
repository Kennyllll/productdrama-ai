"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DEMO_PROJECT_ID, demoProject } from "@/lib/mock/demo";
import { stepHref, workflowSteps } from "@/lib/navigation";
import type { ProjectKind } from "@/lib/types";

export interface ShellProject {
  id: string;
  name: string;
  kind: ProjectKind;
}

const LONG_TOOLS = [
  ["shots", "镜头卡"],
  ["timeline", "时间线"],
  ["set", "3D 布景"],
] as const;
const LONG_PAGES = new Set<string>([
  ...workflowSteps.map((s) => s.key).filter((k) => k !== "product"),
  ...LONG_TOOLS.map(([k]) => k),
]);

function NavLink({ href, active, children, sub }: { href: string; active: boolean; children: ReactNode; sub?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg py-2 transition-colors ${sub ? "pl-7 pr-3 text-[13px]" : "px-3 text-sm"} ${
        active ? "bg-amber-400/15 text-amber-200" : "text-neutral-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

const Group = ({ children }: { children: ReactNode }) => (
  <p className="hidden truncate px-3 pb-1 pt-4 text-[11px] tracking-wider text-neutral-500 lg:block">{children}</p>
);

export function AppShell({ children, projects }: { children: ReactNode; projects: ShellProject[] }) {
  const pathname = usePathname();
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const page = pathname.split("/")[3] ?? "";
  const project: ShellProject | null = !projectId
    ? null
    : projectId === DEMO_PROJECT_ID
      ? { id: DEMO_PROJECT_ID, name: demoProject.name, kind: "series" }
      : (projects.find((p) => p.id === projectId) ?? null);
  const isDemo = project?.id === DEMO_PROJECT_ID;
  const onLong = LONG_PAGES.has(page);
  const [longOpen, setLongOpen] = useState<boolean | null>(null);
  const showLong = longOpen ?? onLong;
  const href = (k: string) => `/projects/${project?.id}/${k}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 lg:flex">
      <aside className="border-b border-white/10 bg-black/40 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-5 py-4">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-white">
            Product<span className="text-amber-400">Drama</span> AI
          </Link>
        </div>
        <nav aria-label="主导航" className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
          <Group>全局</Group>
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            项目中心
          </NavLink>
          <NavLink href="/easter-eggs" active={pathname.startsWith("/easter-eggs")}>
            素材库
          </NavLink>
          <NavLink href="/families" active={pathname.startsWith("/families")}>
            家庭库
          </NavLink>
          <NavLink href="/hooks" active={pathname.startsWith("/hooks")}>
            Hook 库
          </NavLink>
          <NavLink href="/settings" active={pathname.startsWith("/settings")}>
            设置
          </NavLink>
          {project ? (
            <>
              <Group>当前产品 · {project.name}</Group>
              <NavLink href={href("product")} active={page === "product"}>
                产品资料
              </NavLink>
              {!isDemo ? (
                <NavLink href={href("shorts")} active={page === "shorts"}>
                  短视频
                </NavLink>
              ) : null}
              <button
                type="button"
                onClick={() => setLongOpen(!showLong)}
                aria-expanded={showLong}
                className={`flex shrink-0 items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 ${
                  onLong && !showLong ? "text-amber-200" : "text-neutral-300"
                }`}
              >
                长视频 <span className="text-xs text-neutral-500">{showLong ? "▾" : "▸"}</span>
              </button>
              {showLong ? (
                <>
                  {workflowSteps
                    .filter((s) => s.key !== "product")
                    .map((s) => (
                      <NavLink key={s.key} sub href={stepHref(project.id, s.key)} active={page === s.key}>
                        {s.label.replace("工作台", "")}
                      </NavLink>
                    ))}
                  {!isDemo
                    ? LONG_TOOLS.map(([k, label]) => (
                        <NavLink key={k} sub href={href(k)} active={page === k}>
                          {label}
                        </NavLink>
                      ))
                    : null}
                </>
              ) : null}
              {!isDemo ? (
                <>
                  <NavLink href={href("ledger")} active={page === "ledger"}>
                    费用
                  </NavLink>
                  <NavLink href={href("rules")} active={page === "rules"}>
                    规则与决定
                  </NavLink>
                </>
              ) : null}
            </>
          ) : null}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
