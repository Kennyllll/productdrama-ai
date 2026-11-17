import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { DeleteProjectButton, NewProjectForm } from "@/components/workbench/NewProjectForm";
import { getProductModel } from "@/lib/model-repo";
import { listLedger } from "@/lib/production-repo";
import { countAssets, getProduct, listLocalProjects } from "@/lib/repo";
import { listShortVideos } from "@/lib/shorts-repo";

export const dynamic = "force-dynamic";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("zh-CN");
const usd = (n: number) => `$${n.toFixed(2)}`;

function Fact({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-md bg-white/5 px-3 py-2">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`text-sm ${ok ? "text-neutral-100" : "text-neutral-500"}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const projects = listLocalProjects();
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="项目中心" description="每个产品一张卡片。点「短视频」或「长视频」进入制作。" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {projects.length === 0 ? (
            <Card>
              <p className="text-sm text-neutral-500">还没有产品，在右侧新建一个。</p>
            </Card>
          ) : null}
          {projects.map((p) => {
            const bible = getProduct(p.id)?.bible ?? [];
            const filled = bible.filter((f) => f.value.trim()).length;
            const photos = countAssets(p.id, "product_photo");
            const model = getProductModel(p.id);
            const shorts = listShortVideos(p.id).length;
            const spent = listLedger(p.id).reduce((s, e) => s + e.usd, 0);
            const base = `/projects/${p.id}`;
            const shortFirst = p.kind === "product" || shorts > 0;
            const primary = "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-300";
            const secondary = "rounded-lg border border-white/20 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10";
            return (
              <article key={p.id} className="rounded-xl border border-white/10 bg-neutral-900/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-medium text-white">{p.name}</p>
                    <p className="text-xs text-neutral-500">
                      {p.brand} · 更新于 {formatDate(p.updatedAt)}
                    </p>
                  </div>
                  <DeleteProjectButton id={p.id} name={p.name} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Fact label="产品资料" value={bible.length ? `${filled}/${bible.length} 项 · ${photos} 张照片` : `${photos} 张照片`} ok={photos > 0} />
                  <Fact label="3D 模型" value={model ? "已上传" : "没有"} ok={!!model} />
                  <Fact label="短视频" value={`${shorts} 条`} ok={shorts > 0} />
                  <Fact label="累计花费" value={usd(spent)} ok={spent > 0} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`${base}/shorts`} className={shortFirst ? primary : secondary}>
                    短视频
                  </Link>
                  <Link href={`${base}/creative`} className={shortFirst ? secondary : primary}>
                    长视频
                  </Link>
                  <Link href={`${base}/product`} className={secondary}>
                    产品资料
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        <div>
          <Card title="新建产品">
            <NewProjectForm />
          </Card>
        </div>
      </div>
    </main>
  );
}
