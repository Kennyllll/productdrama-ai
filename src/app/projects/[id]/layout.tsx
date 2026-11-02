import { notFound } from "next/navigation";
import { ProjectStatusBar } from "@/components/ProjectStatusBar";
import { DEMO_PROJECT_ID, getProject } from "@/lib/mock/demo";

export function generateStaticParams() {
  return [{ id: DEMO_PROJECT_ID }];
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return (
    <>
      <ProjectStatusBar project={project} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
