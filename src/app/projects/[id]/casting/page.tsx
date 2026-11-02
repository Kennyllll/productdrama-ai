import { notFound } from "next/navigation";
import { CastingStudio } from "@/components/workbench/CastingStudio";
import { LocalCastingStudio } from "@/components/workbench/LocalCastingStudio";
import { DemoNotice, PageHeader } from "@/components/ui";
import { getProjectEggId, listCharacters, listEggs } from "@/lib/cast-repo";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { findLocalProject } from "@/lib/repo";

export default async function CastingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const header = (
    <PageHeader
      title="选角工作台 · AI Casting Studio"
      description="支持多位主角、配角、临时角色、群演、动物与幻想角色；建立 Character Bible 并追踪四集出场。"
    />
  );
  if (id === DEMO_PROJECT_ID) {
    return (
      <>
        {header}
        <DemoNotice />
        <CastingStudio />
      </>
    );
  }
  if (!findLocalProject(id)) notFound();
  return (
    <>
      {header}
      <LocalCastingStudio projectId={id} initialCast={listCharacters(id)} eggs={listEggs()} initialEggId={getProjectEggId(id)} />
    </>
  );
}
