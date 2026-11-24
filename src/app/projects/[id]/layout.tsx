import { Suspense } from "react";
import { NotFoundView } from "@/components/NotFoundView";
import { ProjectStatusBar } from "@/components/ProjectStatusBar";
import { GuideRail } from "@/components/production/GuideRail";
import { listDecisions, listGuideMessages } from "@/lib/production-repo";
import { findProject } from "@/lib/repo";
import { listShortVideos } from "@/lib/shorts-repo";

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
  // notFound() thrown from this layout leaves the client router stuck on the 404 page (Next 15), so render it inline.
  if (!project) return <NotFoundView />;
  const local = project.source === "local";
  const videoTitles = local ? Object.fromEntries(listShortVideos(id).map((v) => [v.id, v.title])) : {};
  return (
    <>
      <ProjectStatusBar project={project} videoTitles={videoTitles} />
      <div className="flex items-start">
        <main className="@container/main mx-auto min-w-0 max-w-7xl flex-1 px-6 py-8">{children}</main>
        {local ? (
          <Suspense fallback={null}>
            <GuideRail projectId={id} initialMessages={listGuideMessages(id)} decisions={listDecisions(id)} videoTitles={videoTitles} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
