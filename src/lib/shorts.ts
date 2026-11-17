// 产品短视频：模板、数据结构、花钱关卡（纯函数，客户端和服务端共用）。
import type { SetLayout } from "@/lib/production-repo";
import type { ShotScene } from "@/lib/shorts-scenes";
import type { ShotBasis } from "@/lib/shorts-sync";

/** 短视频硬约束：成片每秒的全部花费（含重做和废片）不超过这个数 */
export const MAX_USD_PER_SECOND = 0.5;
export const BUDGET_WARN_RATIO = 0.8;
/** 每镜默认：1 次 + 1 次重做；再多必须重新审批并写明原因 */
export const DEFAULT_ATTEMPTS = 2;

export const VIDEO_MODEL = "bytedance/seedance-2.5/image-to-video";
export const FRAME_MODEL = "marketing-studio/image/sunburst";
/** Higgsfield 估价接口实测单价（美元/秒）；短视频不提供 1080p（$0.652/秒，必然超出每秒成本上限） */
export const VIDEO_USD_PER_SEC = { "480p": 0.1177, "720p": 0.2647 } as const;
export type VideoResolution = keyof typeof VIDEO_USD_PER_SEC;
export const VIDEO_MIN_SEC = 4;
export const VIDEO_MAX_SEC = 12;
/** Sunburst 首帧实测平均约 $0.10/张；估价接口能返回金额时以接口为准 */
export const FRAME_USD_FALLBACK = 0.1;

export interface ShortTemplate {
  id: string;
  label: string;
  look: string;
  description: string;
  beats: { label: string; seconds: number; hint: string }[];
  /** 只有开箱类模板会出现包装；必须先上传真实包装照 */
  needsPackaging?: boolean;
}

export const SHORT_TEMPLATES: ShortTemplate[] = [
  {
    id: "pov-gift",
    label: "POV 送礼",
    look: "ugc",
    description: "手机竖拍的真实家庭感：一句 POV 字幕钩子 → 送礼（产品以组装好的成品出场，不拆箱）→ 惊喜 → 使用演示 + 产品特写 → 多个家庭/场景证明 → 评论关键词 CTA。参考 TikTok 节日礼物爆款。",
    beats: [
      { label: "钩子 · 送礼", seconds: 3, hint: "POV 主观视角或旁观视角，大人把组装好的产品（可系蝴蝶结）推到 / 拿到孩子面前，或从树后、毯子下亮出；没有纸箱和包装；顶部字幕 POV 句一直挂着" },
      { label: "惊喜反应", seconds: 3, hint: "孩子第一眼看到产品，真实大笑或尖叫，扑上去摸" },
      { label: "产品特写", seconds: 2, hint: "手部操作产品的核心动作（开机、亮灯、调节），产品清楚可辨" },
      { label: "使用演示", seconds: 4, hint: "产品最核心的玩法 / 功能，有明确的结果（得分、亮起、动起来）" },
      { label: "场景证明", seconds: 4, hint: "换 1–2 个不同家庭或房间，同一玩法，情绪更高" },
      { label: "CTA", seconds: 3, hint: "字幕换成评论关键词 CTA，例如 Comment \"XXX\" if you want one" },
    ],
  },
  {
    id: "problem-solution",
    label: "问题 → 解决",
    look: "ugc",
    description: "先拍一个真实痛点（孩子不肯放下手机、学骑车总摔），再用产品解决，结尾展示结果。",
    beats: [
      { label: "痛点", seconds: 3, hint: "一个所有家长都认得的场面，字幕点题" },
      { label: "转折", seconds: 2, hint: "产品出现" },
      { label: "使用", seconds: 5, hint: "产品怎么解决问题，动作清楚" },
      { label: "结果", seconds: 4, hint: "情绪回报：笑、拥抱、自己完成" },
      { label: "CTA", seconds: 2, hint: "一句话 + 品牌" },
    ],
  },
  {
    id: "unboxing",
    label: "开箱",
    look: "ugc",
    description: "俯拍开箱，逐件拿出配件，最后第一次使用。需要先在产品页上传真实包装照片。",
    needsPackaging: true,
    beats: [
      { label: "包装", seconds: 2, hint: "包装正面清楚" },
      { label: "拆开", seconds: 4, hint: "手部动作，逐件拿出" },
      { label: "第一次使用", seconds: 5, hint: "产品第一次运转" },
      { label: "反应 + CTA", seconds: 4, hint: "真实反应，字幕 CTA" },
    ],
  },
  {
    id: "cinematic",
    label: "电影感短片",
    look: "cinematic",
    description: "电影级光线和机位的 15–20 秒小故事：一个情绪瞬间，产品是情感桥梁，结尾字卡 + Logo。",
    beats: [
      { label: "开场画面", seconds: 3, hint: "建立人物和地点" },
      { label: "小冲突", seconds: 4, hint: "人物想要什么、被什么挡住" },
      { label: "产品时刻", seconds: 5, hint: "产品帮人物跨过去" },
      { label: "情绪回报", seconds: 4, hint: "表情和动作，不靠台词" },
      { label: "字卡 + Logo", seconds: 3, hint: "一句话 + Logo（用原始文件合成）" },
    ],
  },
];

export const findTemplate = (id: string) => SHORT_TEMPLATES.find((t) => t.id === id) ?? SHORT_TEMPLATES[0];

export interface ShortConcept {
  id: string;
  title: string;
  hookCaption: string;
  ctaCaption: string;
  audience: string;
  setting: string;
  people: string;
  why: string;
}

/** 镜头关口：构图草案 → 构图确认 → 首帧已生成 → 首帧通过 → 视频待审 → 采用；任一步可退回 */
export type ShotStage = "draft" | "comp_ok" | "frame_ready" | "frame_ok" | "video_ready" | "accepted";

export const STAGE_LABELS: Record<ShotStage, string> = {
  draft: "构图草案",
  comp_ok: "构图已确认",
  frame_ready: "首帧待检查",
  frame_ok: "首帧已通过",
  video_ready: "视频待审",
  accepted: "已采用",
};

export interface ShotIssue {
  id: string;
  text: string;
  /** 出问题的那一版视频 */
  fromJobId: string | null;
  status: "open" | "fixed";
  /** shot = 只管这一镜；video = 整条视频都要注意（后面的镜头审片时也提醒）。旧数据没有 = shot */
  scope?: "shot" | "video";
}

export interface ShortShot {
  id: string;
  beat: string;
  /** 成片里用几秒，从生成视频的第 trimStart 秒开始 */
  useSeconds: number;
  trimStart: number;
  /** 生成几秒（Seedance 最少 4 秒）；多出的部分是浪费，尽量把相邻同机位动作合进一镜 */
  genSeconds: number;
  description: string;
  camera: string;
  caption: string;
  productNote: string;
  /** 产品上的屏幕 / 投影 / 灯光内容：必须用真实素材合成，不让 AI 画 */
  compositeNote: string;
  /** 拍摄者：姿态 + 可选手 / 影子（shorts-operator.ts 的 opString），或自己写的描述；空 = 站着 */
  operator?: string;
  framePrompt: string;
  motionPrompt: string;
  stage: ShotStage;
  /** 返工时写下的问题；新版本出来后逐条和旧版对照，全部“已解决”才能采用 */
  issues?: ShotIssue[];
  /** 3D 布景里摆好的机位 / 运镜；null = 还没摆 */
  layout: SetLayout | null;
  /** 按机位截下来的 3D 构图图（视频目录里的文件名），确认构图前必须有 */
  compFile: string | null;
  frameJobId: string | null;
  videoJobId: string | null;
  checkNote: string;
  /** 本镜场地（场地库 id + 版本 + 节日主题）；确认构图后锁定版本。旧数据没有时按 video.room 迁移 */
  scene?: ShotScene;
  /** 第几个家庭（1 起）：同一家庭沿用演员和服装；换家庭时旧演员不当参考 */
  family?: number;
  /** 镜头级特殊要求：写进首帧和视频提示词，审片逐条核对 */
  special?: string;
  /** 保存文字时的 3D 关键信息；3D 变了就提示文字过期（shorts-sync.ts） */
  textBasis?: ShotBasis;
  /** 有值 = 开头版本：多个开头共用同一组正文，不参与正文的顺序锁。cut = 在第几秒剪成 2 个镜头；zoomB = 后半段放大倍数（1–1.5） */
  hook?: ShotHook;
  /** 谁拿手机：家庭成员 id；"none" = 不指定；空 = 跟视频设定 */
  filmer?: string;
}

export interface ShotHook {
  name: string;
  /** 从 Hook 库来的：库里的 id / 名字，视频里填的属性值，产品怎么出场，字幕模板，哪些属性影响画面 */
  libId?: string;
  libName?: string;
  values?: Record<string, string>;
  entry?: string;
  captionTpl?: string;
  visualKeys?: string[];
  cut?: number;
  zoomB?: number;
}

export interface ShortVideoData {
  templateId: string;
  brief: string;
  concepts: ShortConcept[];
  conceptId: string | null;
  shots: ShortShot[];
  /** 场地地图预设（shorts-set.ts） */
  room: string;
  resolution: VideoResolution;
  /** 预算（美元）；默认 = 成片秒数 × 每秒上限，用户只能主动提高。只算正文 + 第一个开头 */
  budgetUsd: number | null;
  /** 导出时要出的开头（shot id）；空 = 第一个开头 */
  exportHooks?: string[];
  /** 旧数据已迁移：第 1 镜标成开头「原版」 */
  hooksReady?: boolean;
  /** 产品颜色款（产品资料里的 product_colors）；空 = 原色 */
  colorId?: string | null;
  /** 整条视频的节日（THEMES 的 id），新建时选；所有镜头跟着它。旧数据没有 = 按镜头推断 */
  theme?: string;
  /** 自定义节日的描述（theme = "custom"） */
  themeText?: string;
  /** 家庭位（镜头的 family 编号）→ 家庭库 id；没选 = 不写具体成员 */
  families?: Record<string, string>;
  /** 整条视频谁拿手机（家庭位 1 的成员 id）；空 = 不指定 */
  filmer?: string;
  /** 从哪个模板（哪一版）套来的 */
  fromTemplate?: { id: string; v: number; name: string; fromProduct: string; fromKind?: string; rewritten?: boolean };
}

export interface ShortVideo extends ShortVideoData {
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
}

/** 整条视频的节日：没存过的旧视频按第一个已绑定场地的镜头推断 */
export function videoTheme(v: Pick<ShortVideoData, "theme" | "themeText" | "shots" | "room">): { theme: string; themeText?: string } {
  if (v.theme) return { theme: v.theme, themeText: v.themeText };
  const sh = v.shots.find((s) => s.scene)?.scene;
  return sh ? { theme: sh.theme, themeText: sh.themeText } : { theme: v.room === "xmas-living" ? "christmas" : "none" };
}

export const emptyShortData = (templateId = "pov-gift", theme?: { theme: string; themeText?: string }): ShortVideoData => ({
  ...(theme ? { theme: theme.theme, ...(theme.themeText ? { themeText: theme.themeText } : {}) } : {}),
  templateId,
  brief: "",
  concepts: [],
  conceptId: null,
  shots: [],
  room: "living",
  resolution: "720p",
  budgetUsd: null,
});

export const hooksOf = (v: Pick<ShortVideoData, "shots">) => v.shots.filter((s) => s.hook);
export const bodyOf = (v: Pick<ShortVideoData, "shots">) => v.shots.filter((s) => !s.hook);
/** 第一个开头之外的开头：各自单独预算，不占正文预算 */
export const isExtraHook = (v: Pick<ShortVideoData, "shots">, s: Pick<ShortShot, "id" | "hook">) => !!s.hook && hooksOf(v)[0]?.id !== s.id;
/** 额外开头的预算 = 生成秒数 × 每秒上限 */
export const hookBudget = (s: Pick<ShortShot, "genSeconds" | "useSeconds">) => Math.round(Math.max(s.genSeconds, s.useSeconds) * MAX_USD_PER_SECOND * 100) / 100;
/** 成片里的片段：开头有剪辑点时，一段生成视频剪成 2 个镜头（后半段可放大） */
export function shotCuts(s: Pick<ShortShot, "trimStart" | "useSeconds" | "hook">): { start: number; len: number; zoom: number }[] {
  const t = s.trimStart || 0;
  const c = s.hook?.cut;
  if (!c || c < 0.3 || c > s.useSeconds - 0.3) return [{ start: t, len: s.useSeconds, zoom: 1 }];
  return [
    { start: t, len: c, zoom: 1 },
    { start: t + c, len: Math.round((s.useSeconds - c) * 10) / 10, zoom: Math.min(1.5, Math.max(1, s.hook?.zoomB ?? 1)) },
  ];
}

/** 成片秒数 = 正文 + 一个开头 */
export const finalSeconds = (v: Pick<ShortVideoData, "shots">) => bodyOf(v).reduce((s, x) => s + x.useSeconds, 0) + (hooksOf(v)[0]?.useSeconds ?? 0);
export const defaultBudget = (v: Pick<ShortVideoData, "shots">) => Math.round(finalSeconds(v) * MAX_USD_PER_SECOND * 100) / 100;
export const budgetOf = (v: Pick<ShortVideoData, "shots" | "budgetUsd">) => v.budgetUsd ?? defaultBudget(v);

/** 严格顺序：正文前面的镜头都采用了才能做这一镜（开头不受限制，也不挡正文）。返回挡住它的镜头序号（1 起），没有挡住返回 0 */
export function waitingFor(v: Pick<ShortVideoData, "shots">, shotId: string): number {
  const i = v.shots.findIndex((s) => s.id === shotId);
  if (i < 0 || v.shots[i].hook) return 0;
  const k = v.shots.findIndex((s, j) => j < i && !s.hook && s.stage !== "accepted");
  return k >= 0 ? k + 1 : 0;
}

/** scene = 场地空场景参考图（Sunburst，挂在场地版本上，记在当前视频预算里） */
export type JobKind = "frame" | "video" | "scene";
export type JobStatus = "submitting" | "submitted" | "completed" | "failed";

export interface GenJob {
  id: string;
  videoId: string;
  shotId: string;
  kind: JobKind;
  model: string;
  paramsHash: string;
  seconds: number;
  estUsd: number;
  actualUsd: number | null;
  status: JobStatus;
  requestId: string | null;
  reason: string;
  isTest: boolean;
  hasOutput: boolean;
  error: string | null;
  createdAt: string;
}

/** 已花或已占用的钱：失败任务不收费，不计 */
export const jobCost = (j: GenJob) => (j.status === "failed" ? 0 : (j.actualUsd ?? j.estUsd));

export interface QuoteInput {
  kind: JobKind;
  shot: ShortShot;
  video: ShortVideoData;
  jobs: GenJob[];
  paramsHash: string;
  unitUsd: number;
  seconds: number;
  reason: string;
  overLimit: boolean;
}

/** fix：text = 改文字（可交给 AI 按 3D 改），3d = 去摆放界面改人偶；fig = 要改的人偶 id */
export interface Conflict {
  msg: string;
  fix: "text" | "3d";
  fig?: string;
}

export interface Quote {
  kind: JobKind;
  model: string;
  seconds: number;
  resolution: string;
  unitUsd: number;
  costUsd: number;
  shotSpent: number;
  videoSpent: number;
  budget: number;
  remainingAfter: number;
  perSecondAfter: number;
  attempt: number;
  warnings: string[];
  /** 文字 / 动作栏和 3D 对不上（生成前自查）；非空时要用户确认看过才能批准 */
  conflicts: Conflict[];
  blocked: string[];
  needsReason: boolean;
  needsOverLimit: boolean;
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;

/** 花钱前的全部检查。blocked 非空时按钮必须禁用 */
export function quoteJob(q: QuoteInput): Quote {
  const { kind, shot, video, jobs } = q;
  const mine = jobs.filter((j) => !j.isTest && j.shotId === shot.id);
  const sameKind = mine.filter((j) => j.kind === kind);
  const charged = sameKind.filter((j) => j.status !== "failed");
  const costUsd = r2(q.unitUsd * (kind === "video" ? q.seconds : 1));
  const extraHook = isExtraHook(video, shot);
  const extraIds = new Set(hooksOf(video).slice(1).map((s) => s.id));
  const shotSpent = r2(mine.reduce((s, j) => s + jobCost(j), 0));
  const videoSpent = extraHook ? shotSpent : r2(jobs.filter((j) => !j.isTest && !extraIds.has(j.shotId)).reduce((s, j) => s + jobCost(j), 0));
  const budget = extraHook ? hookBudget(shot) : budgetOf(video);
  const overHook = extraHook && videoSpent + costUsd > budget + 1e-9;
  const secs = Math.max(1, finalSeconds(video));
  const attempt = charged.length + 1;
  const blocked: string[] = [];
  const warnings: string[] = [];

  const wait = waitingFor(video, shot.id);
  if (wait && kind !== "scene") blocked.push(`按顺序做：先把 #${wait} 做到“采用”，再做这一镜`);
  if (kind === "frame" && shot.stage === "draft") blocked.push("构图还没确认：先确认本镜构图，再生成首帧");
  if (kind === "video") {
    if (!shot.frameJobId || !["frame_ok", "video_ready", "accepted"].includes(shot.stage)) blocked.push("首帧还没通过检查：先生成首帧并点“首帧通过”");
    if (q.seconds < VIDEO_MIN_SEC || q.seconds > VIDEO_MAX_SEC) blocked.push(`生成时长必须在 ${VIDEO_MIN_SEC}–${VIDEO_MAX_SEC} 秒之间`);
  }
  if (shot.stage === "accepted" && kind !== "scene") blocked.push("本镜已采用；要重做先点“退回返工”");
  if (mine.some((j) => j.status === "submitting" || j.status === "submitted")) blocked.push("本镜还有任务在生成中：只能继续等待结果，不能重复提交");
  if (sameKind.some((j) => j.paramsHash === q.paramsHash && j.status !== "failed")) blocked.push("参数和之前某次完全相同：重做必须改变构图、首帧、提示词或时长");
  if (attempt >= 2 && q.reason.trim().length < 4) blocked.push("这是重做：请写重做原因，这次改了什么、为什么（至少 4 个字）");
  if (attempt > DEFAULT_ATTEMPTS && !q.overLimit) blocked.push(`本镜已经 ${charged.length} 次，超过默认上限（1 次 + 1 次重做）：先考虑剪辑或补短镜头；确实要重做请勾选“超限重新审批”`);
  if (overHook) {
    if (!q.overLimit) blocked.push(`超出这个开头的预算 $${budget.toFixed(2)}（生成秒数 × $${MAX_USD_PER_SECOND}）：已花 $${videoSpent.toFixed(2)}，本次 $${costUsd.toFixed(2)}。确实要做请勾选“超限重新审批”`);
  } else if (videoSpent + costUsd > budget + 1e-9) blocked.push(`超出本条视频预算 $${budget.toFixed(2)}：已花 $${videoSpent.toFixed(2)}，本次 $${costUsd.toFixed(2)}。需要你主动提高预算`);
  else if (videoSpent + costUsd >= budget * BUDGET_WARN_RATIO) warnings.push(`花完这次将用掉预算的 ${Math.round(((videoSpent + costUsd) / budget) * 100)}%`);
  const perSecondAfter = r2((videoSpent + costUsd) / secs);
  if (!extraHook && perSecondAfter > MAX_USD_PER_SECOND) warnings.push(`成片每秒成本将到 $${perSecondAfter.toFixed(2)}，超过 $${MAX_USD_PER_SECOND} 上限`);
  if (kind === "video" && q.seconds > shot.useSeconds + 1) warnings.push(`生成 ${q.seconds} 秒只用 ${shot.useSeconds} 秒，浪费 ${(q.seconds - shot.useSeconds).toFixed(1)} 秒`);

  return {
    kind,
    model: kind === "video" ? VIDEO_MODEL : FRAME_MODEL,
    seconds: kind === "video" ? q.seconds : 0,
    resolution: kind === "video" ? video.resolution : "2k 竖版",
    unitUsd: q.unitUsd,
    costUsd,
    shotSpent,
    videoSpent,
    budget,
    remainingAfter: r2(budget - videoSpent - costUsd),
    perSecondAfter,
    attempt,
    warnings,
    conflicts: [],
    blocked,
    needsReason: attempt >= 2,
    needsOverLimit: attempt > DEFAULT_ATTEMPTS || overHook,
  };
}

/** 参数指纹：完全相同的任务不允许再次花钱 */
export function paramsKey(kind: JobKind, p: { prompt: string; seconds?: number; resolution?: string; frameJobId?: string | null }): string {
  return JSON.stringify([kind, p.prompt.trim().replace(/\s+/g, " "), p.seconds ?? 0, p.resolution ?? "", p.frameJobId ?? ""]);
}

/** 拍摄者入镜：露一点拍的人，画面更像家长自己拍的 */
export { operatorPrompt } from "@/lib/shorts-operator";
