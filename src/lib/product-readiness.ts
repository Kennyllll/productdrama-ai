// 建短视频前产品资料够不够（纯函数）：不够就不让正式建，按钮旁写差什么、去哪补。
import { WHITE_REQUIRED } from "@/lib/fal-catalog";
import type { LocalProduct } from "@/lib/types";

/** 出首帧和写脚本一定要用、照片看不出来的细节 */
export const MUST_CONFIRM = ["color-main", "size", "age"];

export interface ProductGap {
  /** 产品资料页第几步 */
  step: 1 | 2 | 4;
  text: string;
}

export function productGaps(p: LocalProduct | null, whiteAngles: string[], hasModel: boolean): ProductGap[] {
  if (!p) return [{ step: 1, text: "产品资料还没建" }];
  const out: ProductGap[] = [];
  if (!p.name.trim()) out.push({ step: 1, text: "产品名称" });
  const miss = WHITE_REQUIRED.filter((a) => !whiteAngles.includes(a));
  if (!hasModel && miss.length) out.push({ step: 2, text: `${miss.join("、")}照` });
  const todo = p.bible.filter((f) => MUST_CONFIRM.includes(f.key) && (f.needsConfirmation || !f.value.trim()));
  if (todo.length) out.push({ step: 4, text: `确认${todo.map((f) => f.label).join("、")}` });
  return out;
}

export const gapsText = (g: ProductGap[]) => `产品资料还差：${g.map((x) => x.text).join("、")}`;
