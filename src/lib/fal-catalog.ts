// 建模服务清单和照片面位：前端和服务端共用（不含密钥、不连数据库）。
// 价格按 fal 官方模型页（2026-11），审批框里显示，用户同意才提交。

/** 白底照 / 颜色款实物照的 10 面 */
export const WHITE_ANGLES = ["正面", "左侧", "背面", "右侧", "顶部", "底部", "左前 45°", "右前 45°", "左后 45°", "右后 45°"] as const;
/** 建白模必传（建模服务只吃这几面） */
export const WHITE_REQUIRED = ["正面", "左侧", "背面", "右侧"];
/** 颜色款必传：正、侧、后、45°；其余选传，多传审核和出首帧更准 */
export const COLOR_REQUIRED = ["正面", "左侧", "背面", "左前 45°"];
/** 车身贴纸贴在哪 */
export const STICKER_SPOTS = ["车架左侧", "车架右侧", "车把", "车头", "座椅", "前叉", "挡泥板", "其他"];

export type Target = "shape" | "color";

export interface Provider {
  id: string;
  target: Target;
  label: string;
  endpoint: string;
  usd: number;
  note: string;
}

export const PROVIDERS: Provider[] = [
  { id: "tripo", target: "shape", label: "Tripo v2.5 多视图（不上色）", endpoint: "tripo3d/tripo/v2.5/multiview-to-3d", usd: 0.2, note: "用正面、左侧、背面、右侧 4 张" },
  { id: "rodin", target: "shape", label: "Rodin（Hyper3D）多图 · 不需要正面", endpoint: "fal-ai/hyper3d/rodin", usd: 0.4, note: "白底照任选 2–5 张，不分角度" },
  { id: "hunyuan", target: "shape", label: "混元 3D v2 多视图（白模）", endpoint: "fal-ai/hunyuan3d/v2/multi-view", usd: 0.16, note: "用正面、背面、左侧 3 张" },
  // 不再用 AI 贴色（Meshy / Trellis）：画上去的 Logo 会糊，误导首帧。颜色款只用实物照当参考
];

export const findProvider = (id: string, target: Target) => PROVIDERS.find((p) => p.id === id && p.target === target) ?? null;
