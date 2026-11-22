// 产品适用年龄：最小值 / 最大值 + 单位（月 / 岁）。存进 Product Bible 的 age 字段，格式固定为「3–6 岁」。
export type AgeUnit = "月" | "岁";
export interface AgeRange {
  min: number;
  max: number;
  unit: AgeUnit;
}

const MAX: Record<AgeUnit, number> = { 月: 216, 岁: 18 };

/** 校验表单填的三个值；返回错误（白话）或年龄段 */
export function checkAgeRange(minRaw: string, maxRaw: string, unitRaw: string): { error: string } | { range: AgeRange | null } {
  const a = minRaw.trim();
  const b = maxRaw.trim();
  if (!a && !b) return { range: null };
  if (!a || !b) return { error: "适用年龄：最小和最大都要填" };
  if (unitRaw !== "月" && unitRaw !== "岁") return { error: "适用年龄：单位选「月」或「岁」" };
  const unit = unitRaw as AgeUnit;
  const min = Number(a);
  const max = Number(b);
  if (!/^\d+(\.\d)?$/.test(a) || !/^\d+(\.\d)?$/.test(b)) return { error: "适用年龄：请填数字，例如 3 和 6" };
  if (min > max) return { error: `适用年龄：最小 ${min} 不能大于最大 ${max}` };
  if (max === 0) return { error: "适用年龄：最大不能是 0" };
  if (max > MAX[unit]) return { error: `适用年龄：最大不能超过 ${MAX[unit]} ${unit}（儿童产品）` };
  return { range: { min, max, unit } };
}

export const formatAge = (r: AgeRange) => `${r.min}–${r.max} ${r.unit}`;

/** 读旧数据：「3–6 岁」「18-36 months」「3 to 6 years」都认；认不出 = null（界面提示重填） */
export function parseAge(text: string): AgeRange | null {
  const m = text.trim().match(/^(\d+(?:\.\d)?)\s*(?:[-–~至到]|to)\s*(\d+(?:\.\d)?)\s*(月|个月|岁|months?|mos?|years?|yrs?|y)?\s*$/i);
  if (!m) return null;
  const unit: AgeUnit = /月|mo/i.test(m[3] ?? "") ? "月" : "岁";
  const r = checkAgeRange(m[1], m[2], unit);
  return "range" in r ? r.range : null;
}
