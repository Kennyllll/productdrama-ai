import { aiPublicInfo } from "@/lib/ai/settings";
import { notFound } from "next/navigation";
import { CreativeWorkbench } from "@/components/workbench/CreativeWorkbench";
import { LocalCreativeWorkbench } from "@/components/workbench/LocalCreativeWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { findLocalProject, getCreative, getProduct, getScript } from "@/lib/repo";

const description = "故事主题、电影视觉风格、产品在剧情中的角色是三个独立选项；然后从三个不同方向的提案中挑选。";

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
