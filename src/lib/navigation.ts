import type { WorkflowStepKey } from "@/lib/types";

export interface WorkflowStep {
  key: WorkflowStepKey;
  label: string;
  description: string;
}

export const workflowSteps: WorkflowStep[] = [
  { key: "product", label: "产品工作台", description: "产品图、Logo 与 Product Bible" },
  { key: "creative", label: "创意工作台", description: "主题、视觉风格、产品角色与三提案" },
  { key: "casting", label: "选角工作台", description: "演员阵容、角色档案与猫咪彩蛋" },
  { key: "script", label: "剧本工作台", description: "四集剧本、场景与台词" },
  { key: "storyboard", label: "分镜工作台", description: "逐镜头关键帧、时长与运镜" },
  { key: "sound", label: "声音工作台", description: "音乐、环境声、音效、留白与混音" },
  { key: "video", label: "视频制作", description: "生成、配音、合成与质检" },
];

export function stepHref(projectId: string, key: WorkflowStepKey): string {
  return `/projects/${projectId}/${key}`;
}
