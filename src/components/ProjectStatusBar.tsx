import type { Project } from "@/lib/types";
import { workflowSteps } from "@/lib/navigation";
import { MockBadge } from "@/components/ui";

export function ProjectStatusBar({ project }: { project: Project }) {
  const current = workflowSteps.find((s) => s.key === project.currentStep);
  const done = Object.values(project.stepStatus).filter((s) => s === "done").length;
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-neutral-950/90 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="font-medium text-white">{project.name}</span>
          <span className="ml-2 text-neutral-500">{project.brand}</span>
        </div>
        <span className="text-neutral-400">
          {project.episodeCount} 集 × {project.secondsPerEpisode} 秒
        </span>
        <span className="text-neutral-400">
          当前步骤：<span className="text-amber-300">{current?.label}</span>
        </span>
        <span className="text-neutral-400">
          进度 {done}/{workflowSteps.length}
        </span>
        <MockBadge>{project.source === "demo" ? "演示数据 · 未接入 AI" : "本地项目 · 未接入 AI"}</MockBadge>
      </div>
    </header>
  );
}
