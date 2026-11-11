import { notFound } from "next/navigation";
import { Card, PageHeader, Tag } from "@/components/ui";
import { DeleteRuleButton, RuleForm } from "@/components/production/RuleForm";
import { listDecisions, listRules } from "@/lib/production-repo";
import { RULE_LAYERS } from "@/lib/rule-layers";
import { findLocalProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

const CHECK: Record<string, string> = {
  product: "局部裁图逐项检查；和 CAD 轮廓比对",
  character: "和定妆照比对；衣着逐项检查",
  scene: "按场景地图算出的地标、角色逐项核对",
  edit: "按剪辑表和声音分层用代码检查",
  process: "向导每次做事前对照",
};

export default async function RulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findLocalProject(id)) notFound();
  const rules = listRules(id);
  const decisions = listDecisions(id);
  return (
    <>
      <PageHeader title="规则库和决定记录" description="你纠正过的规矩存成数据，以后每个镜头都按它检查；换产品时换掉产品那一层。决定记录是你拍过板的事。" />
      <p className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2 text-xs text-amber-100">
        现在规则只是存起来给你和向导看。按规则自动检查图和视频在下一轮做。
      </p>
      <div className="space-y-6">
        <Card title="加一条规则">
          <RuleForm projectId={id} />
        </Card>
        {RULE_LAYERS.map(([layer, label]) => {
          const rs = rules.filter((r) => r.layer === layer);
          return (
            <Card key={layer} title={`${label}（${rs.length}）`} aside={<span className="text-xs text-neutral-500">检查方式：{CHECK[layer]}</span>}>
              {rs.length === 0 ? <p className="text-sm text-neutral-500">还没有。</p> : null}
              <ul className="space-y-2">
                {rs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Tag tone={r.level === "must" ? "rose" : "amber"}>{r.level === "must" ? "必须修" : "提醒"}</Tag>
                    {r.scope === "global" ? <Tag>所有项目</Tag> : null}
                    <span className="text-neutral-100">{r.text}</span>
                    {r.source ? <span className="text-xs text-neutral-500">来源：{r.source}</span> : null}
                    {r.origin === "user" ? <DeleteRuleButton projectId={id} ruleId={r.id} /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
        <Card title={`决定记录（${decisions.length}）`}>
          <ol className="list-inside list-decimal space-y-1 text-sm text-neutral-200">
            {decisions.map((d) => (
              <li key={d.id}>
                {d.text}
                {d.context ? <span className="ml-2 text-xs text-neutral-500">{d.context}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
