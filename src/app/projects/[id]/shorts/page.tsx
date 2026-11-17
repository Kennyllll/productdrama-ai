import Link from "next/link";
import { notFound } from "next/navigation";
import { NewShortForm } from "@/components/shorts/NewShortForm";
import { Card, PageHeader, Tag } from "@/components/ui";
import { findLocalProject, getProduct, listAssets } from "@/lib/repo";
import { budgetOf, finalSeconds, findTemplate, jobCost, MAX_USD_PER_SECOND, SHORT_TEMPLATES } from "@/lib/shorts";
import { finalPath, listProjectJobs, listShortVideos, toJobView } from "@/lib/shorts-repo";
import fs from "node:fs";
import path from "node:path";
import { ProductRefs } from "@/components/shorts/ProductRefs";
import { cadDir, getProductModel } from "@/lib/model-repo";
import { listTemplates } from "@/lib/shorts-templates-repo";

export const dynamic = "force-dynamic";

export default async function ShortsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = findLocalProject(id);
  if (!project) notFound();
  const product = getProduct(id);
  const photos = listAssets(id).filter((a) => a.kind === "product_photo").length;
  const model = getProductModel(id);
  const refUrls = ["ref-front34", "ref-side", "ref-back34"]
    .filter((n) => fs.existsSync(path.join(cadDir(id), "short-refs", `${n}.png`)))
    .map((n) => `/api/cad/${id}?f=short-refs/${n}.png&t=${Math.round(fs.statSync(path.join(cadDir(id), "short-refs", `${n}.png`)).mtimeMs)}`);
  const videos = listShortVideos(id);
  const jobs = listProjectJobs(id).map(toJobView);
  const spentOf = (vid: string) => jobs.filter((j) => j.videoId === vid && !j.isTest).reduce((s, j) => s + jobCost(j), 0);
  const total = jobs.filter((j) => !j.isTest).reduce((s, j) => s + jobCost(j), 0);

  return (
    <>
      <PageHeader
        title="产品短视频"
        description={`一个产品下做多条短视频：每条选一个模板和创意，按镜头过关口生成。硬约束：成片每秒全部花费 ≤ $${MAX_USD_PER_SECOND}（含重做和废片）。`}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title={`这个产品的视频（${videos.length}）`} aside={<span className="text-xs text-neutral-400">产品累计已花 ${total.toFixed(2)}</span>}>
          {videos.length === 0 ? (
            <p className="text-sm text-neutral-400">还没有短视频，右侧新建第一条。</p>
          ) : (
            <ul className="space-y-2">
              {videos.map((v) => {
                const secs = finalSeconds(v);
                const spent = spentOf(v.id);
                const per = secs ? spent / secs : 0;
                const accepted = v.shots.filter((s) => s.stage === "accepted").length;
                return (
                  <li key={v.id}>
                    <Link href={`/projects/${id}/shorts/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3 hover:border-amber-400/50">
                      <div>
                        <p className="font-medium text-white">{v.title}</p>
                        <p className="text-xs text-neutral-400">
                          {findTemplate(v.templateId).label} · {v.shots.length} 镜 / {secs} 秒 · 已采用 {accepted}/{v.shots.length} · {v.resolution}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-neutral-300">
                          ${spent.toFixed(2)} / ${budgetOf(v).toFixed(2)}
                        </span>
                        <Tag tone={per > MAX_USD_PER_SECOND ? "rose" : "emerald"}>${per.toFixed(2)}/秒</Tag>
                        {fs.existsSync(finalPath(v)) ? <Tag tone="amber">已出成片</Tag> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="新建短视频">
            <NewShortForm
              projectId={id}
              templates={SHORT_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description, needsPackaging: Boolean(t.needsPackaging) }))}
              saved={listTemplates().map((t) => ({ id: t.id, name: t.name, v: t.v, theme: t.theme, themeText: t.themeText, shots: t.shots.length, fromProduct: t.fromProduct, needsPackaging: Boolean(findTemplate(t.baseTemplateId).needsPackaging) }))}
              hasPackaging={listAssets(id).some((a) => a.kind === "packaging_photo")}
            />
          </Card>
          <Card title="产品资料（长剧和短视频共用）">
            <p className="text-sm text-neutral-300">{product?.name || "未填写产品名称"}</p>
            <p className="mt-1 text-xs text-neutral-400">产品照 {photos} 张 · 首帧生成时作为参考图，保持外形、颜色和 Logo。没有产品照时用 3D 模型渲染的参考图。</p>
            <ProductRefs projectId={id} modelUrl={model ? `/api/models/${model.id}` : null} urls={refUrls} />
            <Link href={`/projects/${id}/product`} className="mt-2 inline-block text-xs text-amber-300 hover:underline">
              编辑产品资料 →
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
