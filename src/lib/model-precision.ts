// 模型精度：工厂文件 = 精确；照片 AI 建 + 2D 图纸校准过 = 校准；只靠照片 = 近似
export type Precision = "exact" | "calibrated" | "approx";

export const PRECISION_LABEL: Record<Precision, string> = { exact: "精确 · 工厂文件", calibrated: "校准 · 照片模型 + 图纸尺寸", approx: "近似 · 照片建的" };

export function precisionOf(m: { source: string; cad?: { ok: boolean } | null }): Precision {
  return m.source !== "fal" ? "exact" : m.cad?.ok ? "calibrated" : "approx";
}
