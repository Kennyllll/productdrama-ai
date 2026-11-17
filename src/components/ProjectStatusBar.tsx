"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Project } from "@/lib/types";
import { workflowSteps } from "@/lib/navigation";

const PAGE: Record<string, string[]> = {
  product: ["产品资料"],
  shorts: ["短视频"],
  ledger: ["费用"],
  rules: ["规则与决定"],
  shots: ["长视频", "镜头卡"],
  timeline: ["长视频", "时间线"],
  set: ["长视频", "3D 布景"],
  ...Object.fromEntries(
    workflowSteps.filter((s) => s.key !== "product").map((s) => [s.key, ["长视频", s.label.replace("工作台", "")]]),
  ),
};

const Sep = () => <span className="mx-1.5 text-neutral-600">›</span>;

export function ProjectStatusBar({ project, videoTitles = {} }: { project: Project; videoTitles?: Record<string, string> }) {
  const parts = usePathname().split("/");
  const page = parts[3] ?? "";
  const base = `/projects/${project.id}`;
  const crumbs: { label: string; href?: string }[] = (PAGE[page] ?? []).map((label) => ({ label }));
  if (page === "shorts" && parts[4]) {
    crumbs[0].href = `${base}/shorts`;
    crumbs.push({ label: videoTitles[parts[4]] ?? "视频", href: parts[5] ? `${base}/shorts/${parts[4]}` : undefined });
    if (parts[5] === "set" || parts[5] === "stage") crumbs.push({ label: "3D 摆位 · 机位" });
  }
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950/90 px-6 py-3 backdrop-blur">
      <p className="truncate text-sm text-neutral-400">
        <Link href="/dashboard" className="hover:text-white">
          项目中心
        </Link>
        <Sep />
        <Link href={`${base}/${project.kind === "product" ? "shorts" : "product"}`} className="font-medium text-white hover:text-amber-200">
          {project.name}
        </Link>
        {crumbs.map((c, i) => (
          <span key={i}>
            <Sep />
            {c.href ? (
              <Link href={c.href} className="hover:text-white">
                {c.label}
              </Link>
            ) : (
              <span className="text-neutral-200">{c.label}</span>
            )}
          </span>
        ))}
        {project.source === "demo" ? (
          <span className="ml-3 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-neutral-400">示例 · 只读</span>
        ) : null}
      </p>
    </header>
  );
}
