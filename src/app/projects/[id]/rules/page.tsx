import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { RulesBrowser } from "@/components/production/RulesBrowser";
import { listDecisions, listRules } from "@/lib/production-repo";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

const CHECK: Record<string, string> = {
  product: "局部裁图逐项检查；和 CAD 轮廓比对",
  character: "和定妆照比对；衣着逐项检查",
  scene: "按场景地图算出的地标、角色逐项核对",
  edit: "按剪辑表和声音分层用代码检查",
  process: "AI 大脑每次做事前对照",
};

export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findLocalProject(id)) notFound();
  return (
    <>
      <PageHeader title="规则与决定" description="你纠正过的规矩存成规则，以后每个镜头都按它检查；决定记录是你拍过板的事。点分类展开。" />
      <RulesBrowser projectId={id} rules={listRules(id)} decisions={listDecisions(id)} checks={CHECK} />
    </>
  );
}
