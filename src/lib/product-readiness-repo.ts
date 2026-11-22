import "server-only";
import { getProductModel } from "@/lib/model-repo";
import { gapsText, productGaps, type ProductGap } from "@/lib/product-readiness";
import { getProduct, listAssets } from "@/lib/repo";

export function productGapsOf(projectId: string): ProductGap[] {
  const white = listAssets(projectId)
    .filter((a) => a.kind === "white_photo")
    .map((a) => a.angle);
  return productGaps(getProduct(projectId), white, !!getProductModel(projectId));
}

/** 服务端再拦一次：浏览器里按钮禁用了，也不能绕过 */
export function requireProductReady(projectId: string) {
  const g = productGapsOf(projectId);
  if (g.length) throw new Error(`${gapsText(g)}。先到「产品资料」补齐再建短视频`);
}
