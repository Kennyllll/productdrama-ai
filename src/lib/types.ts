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

export interface Project {
  id: string;
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
}

export interface Episode {
  number: EpisodeNumber;
  title: string;
  targetSeconds: number;
  synopsis: string;
  scenes: Scene[];
  shots: Shot[];
}
