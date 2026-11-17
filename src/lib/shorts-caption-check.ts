// 开头字幕自查（纯函数，卡片 / 出片前都用）
import { hookEffectOf, type ShortShot } from "@/lib/shorts";

/** 开头字幕：有效果却是空的 / 有中文（Hook 字体只有英文，会变方框） */
export function captionIssues(s: Pick<ShortShot, "hook" | "caption">): string[] {
  if (!s.hook || s.hook.partOf || !hookEffectOf(s.hook)) return [];
  if (!s.caption.trim()) return ["开头字幕是空的：出片时开头不会有字"];
  return /[\u3000-\u9fff\uff00-\uffef]/.test(s.caption) ? ["开头字幕里有中文或全角符号：Hook 字体只支持英文，出片会显示成方框"] : [];
}

