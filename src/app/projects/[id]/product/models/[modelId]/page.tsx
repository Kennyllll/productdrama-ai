import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ModelReview } from "@/components/workbench/ModelReview";
import { getColor, getProductModelById } from "@/lib/model-repo";
import { findLocalProject, getProduct, listAssets } from "@/lib/repo";
import { getRig } from "@/lib/product-rig-repo";
import { rideKindOf } from "@/lib/figures";

export const dynamic = "force-dynamic";

/** 模型审核：AI 建的白模 / 贴色模型先在这里和照片、贴纸对照，通过才会被视频用到 */
export default async function ModelReviewPage({ params }: { params: Promise<{ id: string; modelId: string }> }) {
  const { id, modelId } = await params;
  const m = getProductModelById(modelId);
  if (!findLocalProject(id) || !m || m.projectId !== id) notFound();
  const color = m.colorId ? getColor(m.colorId) : null;
  const assets = listAssets(id);
  const photos = assets
    .filter((a) => (color ? a.kind === "color_photo" && a.colorId === color.id : a.kind === "white_photo"))
    .map((a) => ({ id: a.id, label: a.angle }));
  const stickers = assets.filter((a) => a.kind === "sticker").map((a) => ({ id: a.id, label: `${a.angle} · ${a.note || "贴纸原图"}` }));
  const product = getProduct(id);
  return (
    <>
      <PageHeader
        title={color ? `审核颜色款「${color.name}」的贴色模型` : m.source === "step" ? "审核工厂 STEP 模型" : "审核白模"}
        description={`${product?.name || "产品"} · ${m.originalName}。左边转动模型，点右边的照片可以把模型转到同一个角度对照。`}
      />
      <ModelReview
        model={{ id: m.id, status: m.status, note: m.note, lengthCm: m.lengthCm, isColor: !!color, source: m.source }}
        glbUrl={`/api/models/${m.id}`}
        photos={photos}
        stickers={stickers}
        kind={rideKindOf(product?.rideKind, product?.category)}
        savedRig={color ? null : getRig(m.id)}
        backHref={`/projects/${id}/product${color ? "#colors" : ""}`}
      />
    </>
  );
}
