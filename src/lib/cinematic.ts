import type { Shot } from "@/lib/types";

export interface CinematicWarning {
  shotIndex: number | null;
  message: string;
}

/** 基于规则的本地电影语言检查（非 AI），帮助发现常见的剪辑与镜头问题 */
export function checkEpisodeShots(shots: Shot[], targetSeconds: number): CinematicWarning[] {
  const warnings: CinematicWarning[] = [];
  const total = shots.reduce((sum, s) => sum + s.seconds, 0);
  if (total !== targetSeconds) {
    warnings.push({ shotIndex: null, message: `本集合计 ${total} 秒，与目标 ${targetSeconds} 秒不符` });
  }
  shots.forEach((s, i) => {
    const next = shots[i + 1];
    if (next && next.size === s.size && next.angle === s.angle && next.transition !== "匹配剪辑") {
      warnings.push({ shotIndex: s.index, message: `镜头 ${s.index} → ${next.index} 景别和机位相同，可能出现跳切` });
    }
    if (s.product === "主体" && s.lens < 35) {
      warnings.push({ shotIndex: s.index, message: `镜头 ${s.index} 产品为主体但使用 ${s.lens}mm 广角，可能使产品变形，建议 ≥ 35mm` });
    }
    if (s.seconds > 10) {
      warnings.push({ shotIndex: s.index, message: `镜头 ${s.index} 超过 10 秒，节奏可能偏慢` });
    }
    if (!s.lighting.trim()) {
      warnings.push({ shotIndex: s.index, message: `镜头 ${s.index} 未设定光线` });
    }
  });
  if (!shots.some((s) => s.size === "特写" || s.size === "近景" || s.size === "大特写")) {
    warnings.push({ shotIndex: null, message: "本集缺少近景 / 特写，情绪表达可能不足" });
  }
  const dialogueShots = shots.filter((s) => s.dialogue.trim()).length;
  if (dialogueShots / shots.length > 0.6) {
    warnings.push({ shotIndex: null, message: `有台词的镜头占 ${dialogueShots}/${shots.length}，建议更多用画面叙事` });
  }
  return warnings;
}
