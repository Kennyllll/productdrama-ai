import { aiPublicInfo } from "@/lib/ai/settings";
import { notFound } from "next/navigation";
import { CreativeWorkbench } from "@/components/workbench/CreativeWorkbench";
import { LocalCreativeWorkbench } from "@/components/workbench/LocalCreativeWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { findLocalProject, getCreative, getProduct, getScript } from "@/lib/repo";

const description = "先选故事主题、画面风格和产品在故事里的角色，再从 3 个方案里挑一个。";

export default async function CreativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === DEMO_PROJECT_ID) {
    return (
      <>
        <PageHeader title="创意工作台" description={description} />
        <DemoNotice />
        <CreativeWorkbench />
      </>
    );
  }
  if (!findLocalProject(id)) notFound();
  return (
    <>
      <PageHeader title="创意工作台" description={description} />
      <LocalCreativeWorkbench
        projectId={id}
        productName={getProduct(id)?.name ?? ""}
        initial={getCreative(id)}
        scriptProposalId={getScript(id)?.proposalId ?? null}
        aiReady={aiPublicInfo().configured}
      />
    </>
  );
}
