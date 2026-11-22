import { notFound } from "next/navigation";
import { ProductBibleEditor } from "@/components/workbench/ProductBibleEditor";
import { LocalProductWorkbench, type TodoItem } from "@/components/workbench/LocalProductWorkbench";
import { loadKit } from "@/lib/product-kit";
import { Card, DemoNotice, LaterButton, MockBadge, PageHeader, PlaceholderFrame, Tag } from "@/components/ui";
import { DEMO_PROJECT_ID, demoProduct } from "@/lib/mock/demo";
import { WHITE_REQUIRED } from "@/lib/fal-catalog";
import { getProductModel } from "@/lib/model-repo";
import { assetPath, findLocalProject, getProduct, listAssets } from "@/lib/repo";
import type { AssetRecord } from "@/lib/types";
import { photoWarningsFor } from "@/lib/photo-quality-server";

const toView = (a: AssetRecord) => ({ id: a.id, angle: a.angle, originalName: a.originalName, size: a.size });

async function LocalProductPage({ id }: { id: string }) {
  const product = findLocalProject(id) ? getProduct(id) : null;
  if (!product) notFound();
  const assets = listAssets(id);
  const logo = assets.find((a) => a.kind === "logo");
  const model = getProductModel(id);
  const kit = loadKit(id);
  const inGrid = new Set(assets.filter((a) => a.kind === "white_photo").map((a) => a.originalName));
  const missing = WHITE_REQUIRED.filter((a) => !kit.white.some((w) => w.angle === a));
  const reviewing = kit.models.filter((m) => m.colorId === null && m.status === "review").length;
  const pending = product.bible.filter((f) => f.needsConfirmation).length;
  const photoWarnings = await photoWarningsFor(assets.filter((a) => a.kind === "white_photo" || a.kind === "product_photo" || a.kind === "color_photo").map((a) => ({ id: a.id, file: assetPath(a) })));
  const todo: TodoItem[] = [];
  if (!product.name.trim()) todo.push({ step: 1, text: "产品名称" });
  if (!product.sellingPoints.length) todo.push({ step: 1, text: "卖点" });
  if (!model && missing.length) todo.push({ step: 2, text: `${missing.join("、")}照` });
  if (!logo) todo.push({ step: 2, text: "Logo" });
  if (reviewing) todo.push({ step: 3, text: `审核 ${reviewing} 个新模型` });
  else if (!model) todo.push({ step: 3, text: "3D 模型" });
  if (pending) todo.push({ step: 4, text: `${pending} 项产品细节未确认` });
  return (
    <>
      <PageHeader title="产品资料" description="按 1–4 步填，做完的步骤会自动收起。短视频和长视频都用这里的资料。" />
      <LocalProductWorkbench
        projectId={id}
        product={product}
        details={assets.filter((a) => a.kind === "product_photo" && !inGrid.has(a.originalName)).map(toView)}
        logo={logo ? toView(logo) : null}
        packaging={assets.filter((a) => a.kind === "packaging_photo").map(toView)}
        model={model ? { id: model.id, originalName: model.originalName, size: model.size } : null}
        kit={kit}
        todo={todo}
        photoWarnings={photoWarnings}
      />
    </>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== DEMO_PROJECT_ID) return <LocalProductPage id={id} />;
  const p = demoProduct;
  return (
    <>
      <PageHeader
        title="产品工作台"
        description="上传真实产品多角度照片与 Logo，建立 Product Bible。产品几何、颜色与 Logo 必须保真。"
        actions={<span className="text-xs text-neutral-500">示例项目不支持上传 · 请在项目中心新建项目</span>}
      />
      <DemoNotice />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="产品照片（建议 6–10 张，多角度）" aside={<MockBadge>占位</MockBadge>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.imageSlots.map((slot) => (
                <div key={slot.id}>
                  <PlaceholderFrame label={slot.angle} className="aspect-square" />
                  <p className="mt-1 text-xs text-neutral-400">
                    {slot.angle} {slot.required ? <Tag tone="amber">首张必需</Tag> : null}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Logo">
            <div className="flex items-center gap-4">
              <PlaceholderFrame label="Logo 文件" className="aspect-square w-28" />
              <p className="text-sm text-neutral-400">
                Logo 在成片中仅使用原始文件合成，不交由 AI 重绘。建议上传透明背景 PNG / SVG。
              </p>
            </div>
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card title="基本信息" aside={<MockBadge />}>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-16 text-neutral-500">名称</dt>
                <dd className="text-white">{p.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 text-neutral-500">品类</dt>
                <dd className="text-white">{p.category}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-neutral-500">卖点</dt>
                <dd>
                  <ul className="list-inside list-disc text-neutral-300">
                    {p.sellingPoints.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </Card>
          <Card title="Product Bible" aside={<LaterButton>AI 辅助识别</LaterButton>}>
            <ProductBibleEditor initial={p.bible} />
          </Card>
        </div>
      </div>
    </>
  );
}
