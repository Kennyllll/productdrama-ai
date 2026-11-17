// ProductDrama AI 领域类型（TASK-001：仅用于本地模拟数据）

export type EpisodeNumber = 1 | 2 | 3 | 4;

export type WorkflowStepKey =
  | "product"
  | "creative"
  | "casting"
  | "script"
  | "storyboard"
  | "sound"
  | "video";

export type StepStatus = "done" | "in_progress" | "todo";

export type ProjectSource = "demo" | "local";

/** series：长剧（多集故事）；product：产品短视频（一个产品下多条短视频） */
export type ProjectKind = "series" | "product";

export interface Project {
  id: string;
  /** demo：只读示例；local：保存在本机 SQLite */
  source: ProjectSource;
  kind: ProjectKind;
  name: string;
  brand: string;
  updatedAt: string;
  episodeCount: number;
  secondsPerEpisode: number;
  currentStep: WorkflowStepKey;
  stepStatus: Record<WorkflowStepKey, StepStatus>;
}

export interface ProductImageSlot {
  id: string;
  angle: string;
  required: boolean;
}

export interface ProductBibleField {
  key: string;
  label: string;
  value: string;
  /** 需要用户确认：无法从照片准确推断的信息 */
  needsConfirmation: boolean;
}

export interface Product {
  name: string;
  category: string;
  sellingPoints: string[];
  imageSlots: ProductImageSlot[];
  bible: ProductBibleField[];
}

export type LocalProduct = Pick<Product, "name" | "category" | "sellingPoints" | "bible"> & {
  /** 产品类型（balance / tricycle / other），空 = 按品类猜 */
  rideKind?: string;
};

/** white_photo：建白模用的白底照（angle = 哪一面）；sticker：车身贴纸（angle = 贴在哪，note = 原图 / 实拍）；color_photo：颜色款实物照（colorId） */
export type AssetKind = "product_photo" | "logo" | "packaging_photo" | "white_photo" | "sticker" | "color_photo";

export interface AssetRecord {
  id: string;
  projectId: string;
  kind: AssetKind;
  angle: string;
  colorId: string | null;
  note: string;
  originalName: string;
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface FormState {
  ok?: string;
  error?: string;
}

/** 本地项目的提案草稿（模板生成后由用户改写，非 AI） */
export interface LocalProposal {
  id: string;
  direction: string;
  title: string;
  logline: string;
  episodeArcs: [string, string, string, string];
  /** 来源：本地模板或 AI（TASK-006） */
  source?: "template" | "ai";
}

/** 故事内核（TASK-009）：共情的来源，提案 / 剧本 / 分镜都围绕它 */
export interface StoryCore {
  audience: string;
  protagonist: string;
  want: string;
  need: string;
  stakes: string;
  truth: string;
  productBridge: string;
  /** AI 对参考作品是否匹配的建议 */
  styleNote: string;
}

export interface LocalCreative {
  themeIds: string[];
  freeText: string;
  styleId: string;
  roleId: string;
  proposals: LocalProposal[];
  selectedProposalId: string | null;
  storyCore: StoryCore;
}

export interface LocalScriptLine {
  id: string;
  /** 空字符串 = 旁白 / 字幕 */
  speaker: string;
  text: string;
  /** 中文翻译（台词为英文时供审阅） */
  translation?: string;
}

export interface LocalScene {
  id: string;
  heading: string;
  summary: string;
  lines: LocalScriptLine[];
}

export interface ScriptEpisode {
  number: EpisodeNumber;
  title: string;
  synopsis: string;
  beats: Beat[];
  scenes: LocalScene[];
}

export interface LocalScript {
  proposalId: string;
  episodes: ScriptEpisode[];
}

export interface OptionItem {
  id: string;
  label: string;
  description: string;
}

export interface StoryProposal {
  id: string;
  title: string;
  logline: string;
  themeIds: string[];
  visualStyleId: string;
  productRoleId: string;
  episodeArcs: [string, string, string, string];
}

export type CharacterKind = "child" | "adult" | "animal" | "fantasy";
export type CharacterRole = "lead" | "supporting" | "cameo" | "extra";

export interface Character {
  id: string;
  name: string;
  kind: CharacterKind;
  role: CharacterRole;
  description: string;
  episodes: EpisodeNumber[];
  /** 真实人物/儿童素材需合法授权 */
  requiresConsent: boolean;
}

export interface PetEasterEgg {
  name: string;
  species: string;
  rules: string[];
  appearances: {
    episode: EpisodeNumber;
    shotId: string;
    seconds: number;
    action: string;
  }[];
}

export interface ScriptLine {
  id: string;
  characterId: string | null; // null = 旁白/字幕
  text: string;
}

export interface Scene {
  id: string;
  heading: string;
  summary: string;
  lines: ScriptLine[];
}

export type CameraMove = "固定" | "推近" | "拉远" | "横摇" | "跟拍" | "环绕" | "俯拍" | "手持";
export type ShotSize = "大远景" | "远景" | "全景" | "中景" | "近景" | "特写" | "大特写";
export type LensMm = 18 | 24 | 35 | 50 | 85 | 100 | 135;
export type CameraAngle = "平视" | "低机位" | "高机位" | "俯视" | "过肩" | "主观视角";
export type Transition = "硬切" | "匹配剪辑" | "叠化" | "J-Cut" | "L-Cut" | "甩镜" | "淡出";
export type ProductPresence = "主体" | "背景" | "无";
export type ReviewStatus = "pending" | "approved" | "needs_changes";

export interface Shot {
  id: string;
  index: number;
  seconds: number;
  description: string;
  camera: CameraMove;
  characterIds: string[];
  dialogue: string;
  product: ProductPresence;
  hasPetEasterEgg: boolean;
  // 电影语言
  size: ShotSize;
  lens: LensMm;
  angle: CameraAngle;
  composition: string;
  lighting: string;
  /** 切到下一个镜头的方式 */
  transition: Transition;
  sound: string;
  continuity: string;
}

export type BeatType = "hook" | "conflict" | "turn" | "cliffhanger" | "resolution";

export interface Beat {
  type: BeatType;
  startSec: number;
  endSec: number;
  description: string;
  /** 情绪强度 1–5 */
  intensity: 1 | 2 | 3 | 4 | 5;
}

export type ReferenceKind = "live-action" | "animation" | "game-cg";

export interface FilmStyle {
  id: string;
  kind: ReferenceKind;
  /** 题材标签，如「赛车 · 成人向」 */
  genre: string;
  film: string;
  /** 导演；游戏 CG 填制作公司 */
  director: string;
  year: number;
  keywords: string[];
  palette: { hex: string; name: string }[];
  lighting: string;
  camera: string;
  composition: string;
  suggestedAspect: string;
  /** 该风格下产品如何呈现（产品本身的几何、颜色、Logo 不变） */
  productTreatment: string;
  heroShots: string[];
  caution: string;
}

export interface VisualSpec {
  filmReference: string;
  aspectRatio: "2.39:1" | "1.85:1" | "16:9" | "9:16";
  fps: 24 | 25 | 30;
  colorGrade: string;
  grain: string;
  lensPackage: string;
  depthOfField: string;
}

export interface Episode {
  number: EpisodeNumber;
  title: string;
  targetSeconds: number;
  synopsis: string;
  beats: Beat[];
  scenes: Scene[];
  shots: Shot[];
}

// ---- TASK-004：选角与彩蛋角色库 ----

export type PhotoOwner = "character" | "egg";

export interface PhotoView {
  id: string;
  originalName: string;
  size: number;
}

export interface PhotoRecord extends PhotoView {
  ownerType: PhotoOwner;
  ownerId: string;
  fileName: string;
  mime: string;
}

export interface LocalCharacter {
  id: string;
  name: string;
  kind: CharacterKind;
  role: CharacterRole;
  description: string;
  episodes: EpisodeNumber[];
  /** 真人（儿童 / 成人）肖像已获授权 */
  consentConfirmed: boolean;
  photos: PhotoView[];
}

export type LocalCharacterInput = Omit<LocalCharacter, "photos">;

/** 工具级彩蛋角色（不限于猫），可在任意项目中选用 */
export interface EasterEgg {
  id: string;
  name: string;
  species: string;
  notes: string;
  photos: PhotoView[];
}

// ---- TASK-005：分镜 ----

export interface LocalShot extends Shot {
  /** 产品在本镜如何出现（角度、动作、与角色的互动） */
  productNote: string;
  review: ReviewStatus;
}

export interface StoryboardEpisode {
  number: EpisodeNumber;
  shots: LocalShot[];
}

export interface LocalStoryboard {
  /** 生成分镜时剧本对应的提案，用于提示分镜是否过期 */
  sourceProposalId: string;
  visualSpec: VisualSpec;
  episodes: StoryboardEpisode[];
}

// ---- 声音设计（TASK-010a） ----
export type SoundLayer = "music" | "ambience" | "sfx" | "silence";

export interface SoundCue {
  id: string;
  startSec: number;
  endSec: number;
  layer: SoundLayer;
  /** 情绪、乐器、速度、强度、对齐的动作 */
  description: string;
}

export interface SoundEpisode {
  number: EpisodeNumber;
  direction: string;
  cues: SoundCue[];
}

export interface SoundPlan {
  sourceProposalId: string;
  motif: string;
  productSignature: string;
  mixNote: string;
  episodes: SoundEpisode[];
}

export type StemLayer = "dialogue" | "music" | "ambience" | "sfx";

export interface SoundStem {
  id: string;
  projectId: string;
  episode: EpisodeNumber;
  layer: StemLayer;
  fileName: string;
  originalName: string;
  mime: string;
  size: number;
  volumeDb: number;
  createdAt: string;
}
