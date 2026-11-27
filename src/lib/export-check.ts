// 导出前自查（纯函数）：正文哪几镜还没采用；成片里会出现的文字有没有合规问题。
import { checkAdText, type AdFacts, type AdIssue, type AdText } from "@/lib/ad-compliance";
import { bodyOf, hooksOf, videoTheme, type ShortShot, type ShortVideoData } from "@/lib/shorts";
import { THEME_WORDS } from "@/lib/shorts-sync";
import { findTheme } from "@/lib/shorts-scenes";
import { STORY_KIND, storyLabel, storyStale } from "@/lib/story-check";

export interface BodyGap {
  n: number;
  beat: string;
  why: string;
}

const STAGE_WHY: Record<string, string> = {
  draft: "还没做 3D 构图",
  comp_ok: "还没出首帧",
  frame_ready: "首帧还没通过",
  frame_ok: "还没出视频",
  video_ready: "视频还没点「采用」",
};

/** 正文缺的镜头：没采用、没有视频、或视频文件丢了（fileOk 由服务端传入） */
export function bodyGaps(v: Pick<ShortVideoData, "shots">, fileOk: (s: ShortShot) => boolean = () => true): BodyGap[] {
  return bodyOf(v).flatMap((s, i) => {
    const why = s.stage !== "accepted" ? STAGE_WHY[s.stage] ?? "还没采用" : !s.videoJobId ? "没有视频" : !fileOk(s) ? "视频文件找不到了，要重做" : "";
    return why ? [{ n: i + 1, beat: s.beat.slice(0, 40), why }] : [];
  });
}

/** 成片里会出现的英文文字：开头字幕、自拍台词、Hook 填的值，正文字幕 */
export function exportTexts(v: Pick<ShortVideoData, "shots">): AdText[] {
  const out: AdText[] = [];
  for (const h of hooksOf(v)) {
    const name = `开头「${h.hook?.name ?? ""}」`;
    out.push({ where: `${name} 字幕`, text: h.caption });
    if (h.hook?.line) out.push({ where: `${name} 台词`, text: h.hook.line });
    for (const [k, val] of Object.entries(h.hook?.values ?? {})) if (val && !h.caption.includes(val)) out.push({ where: `${name} 填的「${k}」`, text: /was|orig|old|原价|划线/i.test(k) ? `was ${val}` : val });
  }
  bodyOf(v).forEach((s, i) => out.push({ where: `正文第 ${i + 1} 镜 字幕`, text: s.caption }));
  return out;
}

export interface ExportReport {
  gaps: BodyGap[];
  blocks: AdIssue[];
  warns: AdIssue[];
}

/** 视频设的是「无节日」，成片字幕 / 台词里却写着节日（Santa、Christmas……）：画面里没有节日布置，看着对不上 */
export function holidayWarns(v: Pick<ShortVideoData, "shots"> & Partial<Pick<ShortVideoData, "theme" | "themeText" | "room">>): AdIssue[] {
  if (videoTheme({ shots: v.shots, theme: v.theme, themeText: v.themeText, room: v.room ?? "" }).theme !== "none") return [];
  return exportTexts(v).flatMap((t) => {
    for (const [k, re] of Object.entries(THEME_WORDS)) {
      const m = t.text?.match(re);
      if (m) return [{ level: "warn" as const, where: t.where, hit: m[0], why: `节日设的是「无节日」，画面里没有${findTheme(k).label}布置：把这个词改掉，或到「视频设定」改节日` }];
    }
    return [];
  });
}

/** 剧本对账查出、还没改掉的问题（剧本改过就不算，出首帧前会重查） */
export function storyWarns(v: Pick<ShortVideoData, "shots"> & Partial<Pick<ShortVideoData, "theme" | "themeText" | "families" | "storyCheck">>): AdIssue[] {
  if (!v.storyCheck || storyStale(v)) return [];
  return v.storyCheck.issues.flatMap((i) => {
    const s = v.shots.find((x) => x.id === i.shotId);
    return s ? [{ level: "warn" as const, where: storyLabel(v, s), hit: i.quote || STORY_KIND[i.kind], why: `${STORY_KIND[i.kind]}：${i.why}` }] : [];
  });
}

export function exportReport(v: Pick<ShortVideoData, "shots"> & Partial<Pick<ShortVideoData, "theme" | "themeText" | "room" | "families" | "storyCheck">>, facts: AdFacts, fileOk?: (s: ShortShot) => boolean): ExportReport {
  const issues = checkAdText(exportTexts(v), facts);
  return { gaps: bodyGaps(v, fileOk), blocks: issues.filter((i) => i.level === "block"), warns: [...issues.filter((i) => i.level === "warn"), ...holidayWarns(v), ...storyWarns(v)] };
}

/** 正式导出被拦的原因（一句话）；空 = 可以正式导出 */
export function formalExportError(r: ExportReport): string {
  if (r.gaps.length) return `正文还有 ${r.gaps.length} 镜没好（${r.gaps.map((g) => `${g.beat ? `「${g.beat}」` : "这一镜"}${g.why}`).join("；")}）。先做完再正式导出，或点「导出预览」看看效果。`;
  if (r.blocks.length) return `有 ${r.blocks.length} 处数字没有依据：${r.blocks.map((b) => `${b.where}「${b.hit}」`).join("、")}。先到产品资料第 5 步填依据，或改掉这句。`;
  return "";
}
