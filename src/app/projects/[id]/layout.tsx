import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectStatusBar } from "@/components/ProjectStatusBar";
import { GuideRail } from "@/components/production/GuideRail";
import { listDecisions, listGuideMessages } from "@/lib/production-repo";
import { findProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = findProject(id);
  if (!project) notFound();
  const local = project.source === "local";
  return (
    <>
      <ProjectStatusBar project={project} />
      <div className="flex items-start">
        <main className="mx-auto min-w-0 max-w-7xl flex-1 px-6 py-8">
          {local ? (
            <p className="mb-6 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-2 text-xs text-emerald-200">
              本地项目：产品、创意、选角、剧本、分镜保存在本机数据库。视频素材和成片保存在本机 uploads/。
            </p>
          ) : null}
          {children}
        </main>
        {local ? (
          <Suspense fallback={null}>
            <GuideRail projectId={id} initialMessages={listGuideMessages(id)} decisions={listDecisions(id)} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
