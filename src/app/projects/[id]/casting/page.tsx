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
      title="选角"
      description="定好每个角色是谁、长什么样、在哪几集出场。"
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
