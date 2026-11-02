import { aiPublicInfo } from "@/lib/ai/settings";
import { notFound } from "next/navigation";
import { LocalScriptWorkbench } from "@/components/workbench/LocalScriptWorkbench";
import { ScriptWorkbench } from "@/components/workbench/ScriptWorkbench";
import { DemoNotice, PageHeader } from "@/components/ui";
import { DEMO_PROJECT_ID } from "@/lib/mock/demo";
import { findLocalProject, getCreative, getScript } from "@/lib/repo";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === DEMO_PROJECT_ID) {
    return (
      <>
        <PageHeader title="剧本工作台" description="四集完整剧本，每集目标 45 秒。可按集、场景与台词修改，并提示受影响的角色与后续集数。" />
        <DemoNotice />
        <ScriptWorkbench />
      </>
    );
  }
  if (!findLocalProject(id)) notFound();
  const creative = getCreative(id);
  const proposal = creative.proposals.find((p) => p.id === creative.selectedProposalId) ?? null;
  return (
    <>
      <PageHeader title="剧本工作台" description="四集剧本，每集 45 秒。编辑节拍、场景与台词，保存在本机；电影感靠画面叙事，台词宜少。" />
      <LocalScriptWorkbench projectId={id} initial={getScript(id)} proposal={proposal} aiReady={aiPublicInfo().configured} />
    </>
  );
}
