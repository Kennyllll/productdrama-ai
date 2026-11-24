// 产品短视频：模板、数据结构、花钱关卡（纯函数，客户端和服务端共用）。
import type { SetLayout } from "@/lib/production-repo";
import type { ShotScene } from "@/lib/shorts-scenes";
import type { ShotBasis } from "@/lib/shorts-sync";
import { PRESET_EFFECT, type HookEffectId } from "@/lib/hook-effects";

/** 短视频硬约束：成片每秒的全部花费（含重做和废片）不超过这个数 */
export const MAX_USD_PER_SECOND = 0.5;
export const BUDGET_WARN_RATIO = 0.8;
/** 每镜默认：1 次 + 1 次重做；再多必须重新审批并写明原因 */
export const DEFAULT_ATTEMPTS = 2;

/** 视频：火山方舟 Seedance 2.5（直接调字节，不经 Higgsfield） */
export const VIDEO_MODEL = "doubao-seedance-2-5-260628";
export const FRAME_MODEL = "marketing-studio/image/sunburst";
/** 短视频首帧默认：fal 上的 Seedream 4.5（$0.04/张，最多 10 张参考图）；每镜可改用 Sunburst。家庭定妆照、场地图只用 Sunburst */
export const SHORT_FRAME_MODEL = "fal-ai/bytedance/seedream/v4.5/edit";
export const SHORT_FRAME_USD = 0.04;
export const SHORT_FRAME_MAX_REFS = 10;
export const jobModelOf = (kind: "frame" | "video" | "scene", s: Pick<ShortShot, "hook" | "layout" | "frameModel">) =>
  kind === "video" ? videoModelOf(s) : kind === "frame" ? frameModelOf(s).model : FRAME_MODEL;
/** 方舟官方价估算（美元/秒）：70 元/百万 token × 宽×高×24 帧/1024，按 7.1 换汇；完成后按方舟返回的实际 token 记账 */
export const VIDEO_USD_PER_SEC = { "480p": 0.0958, "720p": 0.213 } as const;
export type VideoResolution = keyof typeof VIDEO_USD_PER_SEC;
/** 方舟 Seedance 2.x 不收含真人脸的首帧：画面有人的镜头走 Higgsfield（同一个 Seedance 2.5），只拍产品的走方舟 */
export const HF_VIDEO_MODEL = "bytedance/seedance-2.5/image-to-video";
export const HF_VIDEO_USD_PER_SEC = { "480p": 0.1177, "720p": 0.2647 } as const;
export function shotHasPeople(s: Pick<ShortShot, "hook" | "layout">): boolean {
  return s.hook?.scene === "car" || !!s.hook?.selfie || (s.layout?.figures?.length ?? 0) > 0;
}
export const videoModelOf = (s: Pick<ShortShot, "hook" | "layout">) => (shotHasPeople(s) ? HF_VIDEO_MODEL : VIDEO_MODEL);
export const videoUsdPerSec = (s: Pick<ShortShot, "hook" | "layout">, r: VideoResolution) => (shotHasPeople(s) ? HF_VIDEO_USD_PER_SEC : VIDEO_USD_PER_SEC)[r];
export const videoModelLabel = (model: string) =>
  model === SHORT_FRAME_MODEL ? "Seedream 4.5（fal）" : model === FRAME_MODEL ? "Sunburst（Higgsfield）" : model === VIDEO_MODEL ? "火山方舟 Seedance 2.5（只拍产品）" : model === HF_VIDEO_MODEL ? "Higgsfield Seedance 2.5（画面有人：方舟不收真人脸）" : model;
export const VIDEO_MIN_SEC = 4;
export const VIDEO_MAX_SEC = 12;
/** Sunburst 首帧实测平均约 $0.10/张；估价接口能返回金额时以接口为准 */
export const FRAME_USD_FALLBACK = 0.1;

/** 每镜可选的首帧模型：第一个是默认 */
export const SHORT_FRAME_MODELS = [
  { id: "seedream", model: SHORT_FRAME_MODEL, label: "Seedream 4.5", note: "便宜，默认", usd: SHORT_FRAME_USD, maxRefs: SHORT_FRAME_MAX_REFS },
  { id: "sunburst", model: FRAME_MODEL, label: "Sunburst", note: "Logo 字和构图更准", usd: FRAME_USD_FALLBACK, maxRefs: 16 },
] as const;
export type ShortFrameModelId = (typeof SHORT_FRAME_MODELS)[number]["id"];
export const frameModelOf = (s: Pick<ShortShot, "frameModel">) => SHORT_FRAME_MODELS.find((m) => m.id === s.frameModel) ?? SHORT_FRAME_MODELS[0];

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
  /** 首帧出图后的看图检查（对照提示词和 3D）；jobId 不是当前首帧就作废 */
  frameCheck?: { jobId: string; pass: boolean; issues: string[]; at: string; failed?: boolean; /** 产品和实物不一致的问题（规则 #1：只有管理员能放行） */ product?: string[] };
  /** 视频出来后自动看：每 0.5 秒一帧对照产品照查变形 */
  videoCheck?: { jobId: string; pass: boolean; issues: string[]; at: string; failed?: boolean };
  /** 视频出来后自动做的 Logo 锁定（shorts 服务器后台）；jobId 不是当前视频就作废。off = 管理员改回原版 */
  logoLock?: { jobId: string; status: LogoLockStatus; file?: string; box?: [number, number, number, number]; at: string; off?: boolean; note?: string };
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
  /** 首帧用哪个模型（SHORT_FRAME_MODELS）；空 = 默认 Seedream */
  frameModel?: ShortFrameModelId;
}

/** locked = Logo 字变了、已换回；unchanged = 没变不用修；其他 = 没做成的原因 */
export type LogoLockStatus = "locked" | "unchanged" | "no-logo" | "track-lost" | "no-tools" | "no-brand-logo" | "error";

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
  /** 开头字幕效果；空 = 不烧字幕（旧数据） */
  effect?: HookEffectId;
  /** 自拍镜头：拿手机的人入镜对着前置摄像头说台词；强制开声音 */
  selfie?: boolean;
  /** 自拍时说的台词（英文）；空 = 用字幕 */
  line?: string;
  /** 台词的中文意思（AI 写剧本时一起写；手改台词后清空） */
  lineZh?: string;
  /** 车里自拍：第一段在停着的汽车里，产品不入镜、不用 3D */
  scene?: "car";
  /** 自拍出镜的人（家庭成员 id）；空 = 视频设定里拿手机的人 */
  who?: string;
  /** 切镜后的第二段：属于哪个开头（开头镜头的 id）。字幕和效果跟着那个开头 */
  partOf?: string;
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
  /** 导出时整条视频加字幕（开头按 Hook 效果，正文同款样式）；默认开 */
  captions?: boolean;
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
  /** 生成视频时要不要声音（只有环境音和动作声效）；默认关。自拍开头不管这里，强制开 */
  sound?: boolean;
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

/** 这一镜生成视频时带不带声音：自拍开头强制带；其余跟视频的声音开关 */
export const shotSound = (v: Pick<ShortVideoData, "sound"> & { shots?: Pick<ShortShot, "id" | "hook">[] }, s: Pick<ShortShot, "hook">): boolean =>
  Boolean(s.hook?.selfie || v.sound || (s.hook?.partOf && v.shots?.some((x) => x.id === s.hook!.partOf && x.hook?.selfie)));
/** 开头的字幕效果；加效果之前采用的 Hook 开头按 Hook 名字补上 */
export const hookEffectOf = (h: ShotHook | undefined): HookEffectId | undefined => h?.effect ?? (h?.libId ? PRESET_EFFECT[h.libName ?? h.name] : undefined);

/** 开头（可选的几种开头，不含切镜后的第二段） */
export const hooksOf = (v: Pick<ShortVideoData, "shots">) => v.shots.filter((s) => s.hook && !s.hook.partOf);
/** 一个开头的全部段：开头自己 + 切镜后的第二段 */
export const hookParts = (v: Pick<ShortVideoData, "shots">, h: ShortShot) => [h, ...v.shots.filter((s) => s.hook?.partOf === h.id)];
export const bodyOf = (v: Pick<ShortVideoData, "shots">) => v.shots.filter((s) => !s.hook);
/** 第一个开头之外的开头：各自单独预算，不占正文预算 */
export const isExtraHook = (v: Pick<ShortVideoData, "shots">, s: Pick<ShortShot, "id" | "hook">) => !!s.hook && hooksOf(v)[0]?.id !== (s.hook.partOf ?? s.id);
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
export const finalSeconds = (v: Pick<ShortVideoData, "shots">) => {
  const h = hooksOf(v)[0];
  return bodyOf(v).reduce((s, x) => s + x.useSeconds, 0) + (h ? hookParts(v, h).reduce((s, x) => s + x.useSeconds, 0) : 0);
};
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
/** unknown = 提交时断线，不知道供应商有没有收到（按可能已扣费记账，挡住本镜重提）；abandoned = 用户放弃等待，按已扣费记账 */
export type JobStatus = "submitting" | "submitted" | "completed" | "failed" | "unknown" | "abandoned";

/** 首帧因为产品和实物不一致而重出：重做原因用这个开头 */
export const RULE1_REDO = "产品和实物不一致";
export const RULE1_MAX = 3;
/** 这一镜因为车不对已经重出几次：重新截过 3D 构图就从 0 算 */
export function rule1Tries(jobs: GenJob[], compFile: string | null | undefined) {
  const compAt = Number(/-(\d{13})\.png$/.exec(compFile ?? "")?.[1] ?? 0);
  return jobs.filter((j) => j.kind === "frame" && j.status !== "failed" && j.reason.startsWith(RULE1_REDO) && Date.parse(j.createdAt) > compAt).length;
}

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
  /** 额外开头：费用和预算只算这个开头 */
  extraHook: boolean;
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
  const extraIds = new Set(video.shots.filter((s) => isExtraHook(video, s)).map((s) => s.id));
  const shotSpent = r2(mine.reduce((s, j) => s + jobCost(j), 0));
  // 额外开头可能有两段（切镜前 / 后）：费用和预算按整个开头算
  const hookKey = shot.hook?.partOf ?? shot.id;
  const hookShots = extraHook ? video.shots.filter((s) => s.hook && (s.hook.partOf ?? s.id) === hookKey) : [];
  const hookIds = new Set(hookShots.map((s) => s.id));
  const videoSpent = extraHook
    ? r2(jobs.filter((j) => !j.isTest && hookIds.has(j.shotId)).reduce((s, j) => s + jobCost(j), 0))
    : r2(jobs.filter((j) => !j.isTest && !extraIds.has(j.shotId)).reduce((s, j) => s + jobCost(j), 0));
  const budget = extraHook ? r2(hookShots.reduce((a, s) => a + hookBudget(s), 0)) : budgetOf(video);
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
  if (mine.some((j) => j.status === "unknown")) blocked.push("上次提交结果不确定，可能已经扣费：先在页面上方点「重新查一次」，查清了再重做");
  if (mine.some((j) => j.status === "submitting" || j.status === "submitted")) blocked.push("本镜还有任务在生成中：只能继续等待结果，不能重复提交");
  // 出图 / 视频每次都是随机的：参数相同也可能这次变形、下次正常，所以只提示不拦
  if (sameKind.some((j) => j.paramsHash === q.paramsHash && j.status !== "failed")) warnings.push("参数和上次完全相同：这次只是重新随机生成一次，结果可能好也可能还一样");
  if (attempt >= 2 && q.reason.trim().length < 4) blocked.push("这是重做：请写重做原因，这次改了什么、为什么（至少 4 个字）");
  // 规则 #1：车和实物不一致的首帧重出是必须的，不占默认次数，但最多 3 次
  const rule1 = kind === "frame" && q.reason.startsWith(RULE1_REDO);
  const rule1Done = rule1Tries(sameKind, shot.compFile);
  if (rule1 && rule1Done >= RULE1_MAX) blocked.push(`因为车不对已经重出 ${rule1Done} 次：别再花钱重出。换一个能看清产品的 3D 角度、补同角度的实物照，或者向工厂要 STEP`);
  if (attempt > DEFAULT_ATTEMPTS && !q.overLimit && !rule1) blocked.push(`本镜已经 ${charged.length} 次，超过默认上限（1 次 + 1 次重做）：先考虑剪辑或补短镜头；确实要重做请在下面让管理员放行这一次`);
  if (overHook) {
    if (!q.overLimit) blocked.push(`超出这个开头的预算 $${budget.toFixed(2)}（生成秒数 × $${MAX_USD_PER_SECOND}）：已花 $${videoSpent.toFixed(2)}，本次 $${costUsd.toFixed(2)}。确实要做请在下面让管理员放行这一次`);
  } else if (videoSpent + costUsd > budget + 1e-9) blocked.push(`超出本条视频预算 $${budget.toFixed(2)}：已花 $${videoSpent.toFixed(2)}，本次 $${costUsd.toFixed(2)}。需要你主动提高预算`);
  else if (videoSpent + costUsd >= budget * BUDGET_WARN_RATIO) warnings.push(`花完这次将用掉预算的 ${Math.round(((videoSpent + costUsd) / budget) * 100)}%`);
  const perSecondAfter = r2((videoSpent + costUsd) / secs);
  if (!extraHook && perSecondAfter > MAX_USD_PER_SECOND) {
    const msg = `成片每秒成本将到 $${perSecondAfter.toFixed(2)}，超过 $${MAX_USD_PER_SECOND} 上限`;
    if (q.overLimit) warnings.push(msg);
    else blocked.push(`${msg}：先考虑剪辑或少重做；确实要做请在下面让管理员放行这一次`);
  }
  if (kind === "video" && q.seconds > shot.useSeconds + 1) warnings.push(`生成 ${q.seconds} 秒只用 ${shot.useSeconds} 秒，浪费 ${(q.seconds - shot.useSeconds).toFixed(1)} 秒`);

  return {
    kind,
    model: jobModelOf(kind, shot),
    seconds: kind === "video" ? q.seconds : 0,
    resolution: kind === "video" ? video.resolution : "2k 竖版",
    unitUsd: q.unitUsd,
    costUsd,
    shotSpent,
    videoSpent,
    extraHook,
    budget,
    remainingAfter: r2(budget - videoSpent - costUsd),
    perSecondAfter,
    attempt,
    warnings,
    conflicts: [],
    blocked,
    needsReason: attempt >= 2,
    needsOverLimit: attempt > DEFAULT_ATTEMPTS || overHook || (!extraHook && perSecondAfter > MAX_USD_PER_SECOND),
  };
}

/** 参数指纹：完全相同的任务不允许再次花钱 */
export function paramsKey(kind: JobKind, p: { prompt: string; seconds?: number; resolution?: string; frameJobId?: string | null }): string {
  return JSON.stringify([kind, p.prompt.trim().replace(/\s+/g, " "), p.seconds ?? 0, p.resolution ?? "", p.frameJobId ?? ""]);
}

/** 拍摄者入镜：露一点拍的人，画面更像家长自己拍的 */
export { operatorPrompt } from "@/lib/shorts-operator";

/** 后期合成备注是否真的要合成：AI 常写「无（…）」「没有」「none」，这些不算 */
export const needsComposite = (note: string): boolean => {
  const t = note.trim();
  return !!t && !/^(无|没有|不需要|不用|none|no\b|n\/a)/i.test(t);
};
