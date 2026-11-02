// ProductDrama AI 领域类型（TASK-001：仅用于本地模拟数据）

export type EpisodeNumber = 1 | 2 | 3 | 4;

export type WorkflowStepKey =
  | "product"
  | "creative"
  | "casting"
  | "script"
  | "storyboard"
  | "video";

export type StepStatus = "done" | "in_progress" | "todo";

export type ProjectSource = "demo" | "local";

export interface Project {
  id: string;
  /** demo：只读示例；local：保存在本机 SQLite */
  source: ProjectSource;
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

export type LocalProduct = Pick<Product, "name" | "category" | "sellingPoints" | "bible">;

export type AssetKind = "product_photo" | "logo";

export interface AssetRecord {
  id: string;
  projectId: string;
  kind: AssetKind;
  angle: string;
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

export type ReferenceKind = "film" | "racing" | "game-cg";

export interface FilmStyle {
  id: string;
  kind: ReferenceKind;
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
