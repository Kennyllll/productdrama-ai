import { RevisionHistory } from "@/components/admin/RevisionHistory";
import { Card, PageHeader } from "@/components/ui";
import { FamilyLibrary } from "@/components/shorts/FamilyLibrary";
import { listFamilies, listFamilyLedger } from "@/lib/families-repo";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function FamiliesPage() {
  const ledger = listFamilyLedger();
  const total = ledger.reduce((s, e) => s + e.usd, 0);
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="家庭库" description="所有产品共用。短视频里每个人偶绑定一个成员：3D 按身高缩放，首帧提示词写这个人的长相和衣服（衣服跟着视频的节日），有定妆照就用定妆照认脸。" />
      <FamilyLibrary families={listFamilies()} />
      <RevisionHistory entityType="family" />
      <Card title="家庭库费用账本" className="mt-6" aside={<span className="text-sm text-white">{usd(total)}</span>}>
        {ledger.length === 0 ? (
          <p className="text-sm text-neutral-400">还没有出过定妆照。</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-1">时间</th>
                <th>家庭</th>
                <th>成员</th>
                <th>造型</th>
                <th>模型</th>
                <th className="text-right">费用</th>
              </tr>
            </thead>
            <tbody className="text-neutral-200">
              {ledger.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="py-1 text-neutral-400">{new Date(e.createdAt).toLocaleString("zh-CN")}</td>
                  <td>{e.family}</td>
                  <td>{e.member}</td>
                  <td>{e.look}</td>
                  <td className="text-neutral-400">{e.model}</td>
                  <td className="text-right">{usd(e.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-neutral-500">只记成功出图的（失败不收费）。不计入任何产品项目的花费。</p>
      </Card>
    </main>
  );
}
