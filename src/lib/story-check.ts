// 剧本对账（纯函数）：出首帧前，大脑 K3 拿每一镜的文字对照产品资料、绑定的家庭、节日和开头。
// 这里只放不调模型的部分：哪些文字要对账、改过没有、哪一镜被拦、K3 返回的问题怎么收。
import type { ShortShot, ShortVideoData, StoryIssue, StoryIssueKind } from "@/lib/shorts";

export const STORY_FIELDS = ["caption", "description", "camera", "productNote", "framePrompt", "motionPrompt"] as const;
export type StoryField = (typeof STORY_FIELDS)[number];

export const STORY_KIND: Record<StoryIssueKind, string> = {
  feature: "写了产品没有的功能",
  negative: "在说产品的缺点",
  holiday: "节日对不上",
  people: "人物对不上",
  continuity: "开头和正片接不上",
};

type V = Pick<ShortVideoData, "shots" | "theme" | "themeText" | "families" | "storyCheck">;

export const storyLabel = (v: Pick<ShortVideoData, "shots">, s: Pick<ShortShot, "id" | "beat" | "hook">) => {
  const i = v.shots.findIndex((x) => x.id === s.id);
  return s.hook ? `开头「${s.hook.name}」` : `#${i + 1}${s.beat ? ` ${s.beat}` : ""}`;
};

/** 剧本指纹：任何一镜的文字、节日或家庭改了，上次的对账就作废 */
export function storyHash(v: V): string {
  const src = JSON.stringify([v.theme ?? "", v.themeText ?? "", v.families ?? {}, v.shots.map((s) => [s.id, ...STORY_FIELDS.map((k) => s[k] ?? "")])]);
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const storyStale = (v: V) => !v.storyCheck || !!v.storyCheck.error || v.storyCheck.hash !== storyHash(v);

/** 这一镜还有没解决的剧本问题：出首帧 / 视频前拦住（空 = 放行） */
/** 出视频（首帧已经有了）只看动作提示词和字幕里的问题 */
export function storyBlock(v: V, shotId: string, kind: "frame" | "video" = "frame"): string {
  if (storyStale(v)) return "";
  const s = v.shots.find((x) => x.id === shotId);
  const mine = v.storyCheck!.issues.filter((i) => i.shotId === shotId && (kind === "frame" || !s || !i.quote || s.motionPrompt.includes(i.quote) || s.caption.includes(i.quote)));
  if (!mine.length) return "";
  return `剧本对账没过，这次没花钱：${mine.map((i) => `「${i.quote}」${i.why}`).join("；")}。${s && s.stage !== "draft" ? "先点「退回构图」，" : ""}再点「剧本对账」让 AI 自动改好`;
}

/** 收 K3 返回的问题：只留存在的镜头、认识的种类，原话和原因截短 */
export function parseStoryIssues(raw: unknown, v: Pick<ShortVideoData, "shots">): StoryIssue[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(v.shots.map((s) => s.id));
  const out: StoryIssue[] = [];
  for (const x of raw.slice(0, 30)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const shotId = typeof o.shotId === "string" ? o.shotId : "";
    const kind = o.kind as StoryIssueKind;
    const why = typeof o.why === "string" ? o.why.trim() : "";
    if (!ids.has(shotId) || !(kind in STORY_KIND) || !why) continue;
    out.push({ shotId, kind, quote: typeof o.quote === "string" ? o.quote.trim().slice(0, 160) : "", why: why.slice(0, 200) });
  }
  return out;
}

/** K3 给的改写：只认还在写剧本（draft）、而且这轮被查出问题的镜头 */
export function storyRewrites(raw: unknown, v: Pick<ShortVideoData, "shots">, issues: StoryIssue[]): { shotId: string; fields: Partial<Record<StoryField, string>> }[] {
  if (!Array.isArray(raw)) return [];
  const bad = new Set(issues.map((i) => i.shotId));
  const lim: Record<StoryField, number> = { caption: 160, description: 600, camera: 200, productNote: 300, framePrompt: 2000, motionPrompt: 1000 };
  return raw.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const s = v.shots.find((y) => y.id === o.shotId);
    if (!s || s.stage !== "draft" || !bad.has(s.id)) return [];
    const fields: Partial<Record<StoryField, string>> = {};
    for (const k of STORY_FIELDS) if (typeof o[k] === "string" && (o[k] as string).trim()) fields[k] = (o[k] as string).trim().slice(0, lim[k]);
    return Object.keys(fields).length ? [{ shotId: s.id, fields }] : [];
  });
}
