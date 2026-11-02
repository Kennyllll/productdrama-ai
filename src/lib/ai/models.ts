// 文字模型选项（TASK-006 / 009）。客户端和服务端共用，不含 Key。
export const AI_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = "deepseek-flash";
export const DEFAULT_STORY_MODEL: AiModel = "deepseek-v4-pro";
export const AI_MODEL_LABELS: Record<AiModel, string> = {
  "deepseek-flash": "DeepSeek Flash（快、便宜）",
  "deepseek-v4-pro": "DeepSeek V4 Pro（更强，较贵）",
};

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface AiPublicInfo {
  configured: boolean;
  /** 分镜与测试连接使用 */
  model: AiModel;
  /** 故事内核、提案、剧本、审稿使用 */
  storyModel: AiModel;
  /** 只显示 Key 末 4 位 */
  keyHint: string;
}

/** 监制审稿结果（针对初稿） */
export interface ScriptReview {
  scores: { label: string; score: number }[];
  problems: string[];
}
