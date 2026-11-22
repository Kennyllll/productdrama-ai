// 产品资料里的建模素材（白底照、贴纸、颜色款、模型、建模任务），给产品页和视频设定共用。仅服务端。
import { falPublicInfo } from "@/lib/fal";
import { listColors, listModelJobs, listProductModels, type ModelStatus } from "@/lib/model-repo";
import { listAssets } from "@/lib/repo";

export interface KitAsset {
  id: string;
  angle: string;
  note: string;
  colorId: string | null;
}

export interface KitModel {
  id: string;
  name: string;
  status: ModelStatus;
  colorId: string | null;
  source: "upload" | "fal" | "step";
  size: number;
  note: string;
  createdAt: string;
}

export interface KitJob {
  id: string;
  target: "shape" | "color";
  colorId: string | null;
  provider: string;
  status: string;
  error: string | null;
  estUsd: number;
  modelId: string | null;
  createdAt: string;
}

export interface KitData {
  projectId: string;
  falReady: boolean;
  /** 产品照片栏里已传的：可以直接放进白底照 / 颜色款的格子 */
  library: KitAsset[];
  white: KitAsset[];
  stickers: KitAsset[];
  colorPhotos: KitAsset[];
  colors: { id: string; name: string }[];
  models: KitModel[];
  jobs: KitJob[];
}

export function loadKit(projectId: string): KitData {
  const assets = listAssets(projectId);
  const pick = (k: string) => assets.filter((a) => a.kind === k).map((a) => ({ id: a.id, angle: a.angle, note: a.note, colorId: a.colorId }));
  return {
    projectId,
    falReady: falPublicInfo().configured,
    library: pick("product_photo"),
    white: pick("white_photo"),
    stickers: pick("sticker"),
    colorPhotos: pick("color_photo"),
    colors: listColors(projectId).map((c) => ({ id: c.id, name: c.name })),
    models: listProductModels(projectId)
      .filter((m) => m.status !== "archived")
      .map((m) => ({ id: m.id, name: m.originalName, status: m.status, colorId: m.colorId, source: m.source, size: m.size, note: m.note, createdAt: m.createdAt })),
    jobs: listModelJobs(projectId)
      .slice(0, 20)
      .map((j) => ({ id: j.id, target: j.target, colorId: j.colorId, provider: j.provider, status: j.status, error: j.error, estUsd: j.estUsd, modelId: j.modelId, createdAt: j.createdAt })),
  };
}
