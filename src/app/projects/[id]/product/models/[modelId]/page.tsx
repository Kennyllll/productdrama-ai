import fs from "node:fs";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ModelReview } from "@/components/workbench/ModelReview";
import { getColor, getProductModelById, modelPath } from "@/lib/model-repo";
import { parseLengthCm } from "@/lib/model-size";
import { getVisionKey } from "@/lib/vision-qa";
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
  let rev = "0";
  try {
    rev = String(Math.round(fs.statSync(modelPath(m)).mtimeMs));
  } catch {
    // 文件不在：查看器会显示加载失败
  }
  const sizeText = product?.bible?.find((f) => f.key === "size")?.value ?? "";
  return (
    <>
      <PageHeader
        title={color ? `审核颜色款「${color.name}」` : m.source === "fal" ? "审核照片建的模型" : "审核工厂模型"}
        description={`${product?.name || "产品"} · ${m.originalName}。系统已按照片摆正、放好接触点、逐角度截图对照；只看标出来的问题，然后通过或退回。`}
      />
      <ModelReview
        key={rev}
        model={{ id: m.id, status: m.status, note: m.note, lengthCm: m.lengthCm, isColor: !!color, source: m.source, rev }}
        glbUrl={`/api/models/${m.id}?v=${rev}`}
        canCompare={!!getVisionKey()}
        lengthHint={parseLengthCm(sizeText)}
        photos={photos}
        stickers={stickers}
        kind={rideKindOf(product?.rideKind, product?.category)}
        savedRig={color ? null : getRig(m.id)}
        backHref={`/projects/${id}/product${color ? "#colors" : ""}`}
      />
    </>
  );
}
