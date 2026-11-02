// AI 提案与剧本的提示词（TASK-006）。只发送文字资料，不发送照片。
import { filmStyles, productRoles, themeLibrary } from "@/lib/mock/demo";
import type { CharacterKind, CharacterRole, EasterEgg, LocalCharacter, LocalCreative, LocalProduct, LocalProposal } from "@/lib/types";

const KIND_LABELS: Record<CharacterKind, string> = { child: "儿童", adult: "成人", animal: "动物", fantasy: "幻想角色" };
const ROLE_LABELS: Record<CharacterRole, string> = { lead: "主角", supporting: "配角", cameo: "客串", extra: "群演" };

const SYSTEM = `你是一位资深电影导演兼编剧，为电商品牌制作电影级连续产品短剧（4 集，每集 45 秒），面向海外市场。
你只输出 json，不输出任何解释。

必须遵守：
- 电影级：画面叙事为主，台词少而精；每集有钩子、冲突、转折和结尾悬念（第 4 集为收束）。
- 产品推动剧情，是故事的一部分，不能像口播广告或功能罗列。
- 产品保真：只使用产品资料里写明的信息，不编造功能、配件、颜色、尺寸、认证或数据。
- 视觉参考只借鉴光线、色彩、机位、构图和节奏；不复制原作角色、台词、情节、标志性镜头、Logo、字体或音乐。
- 儿童角色不做危险动作，不出现不安全使用产品的画面。`;

function productBlock(p: LocalProduct | null): string {
  if (!p) return "（未填写产品资料）";
  const bible = p.bible.filter((f) => f.value.trim()).map((f) => `- ${f.label}：${f.value.trim()}`);
  return [
    `产品名称：${p.name || "未命名"}`,
    `品类：${p.category || "未填写"}`,
    `卖点：${p.sellingPoints.filter(Boolean).join("；") || "未填写"}`,
    bible.length ? `Product Bible：\n${bible.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function creativeBlock(c: Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId">): string {
  const themes = c.themeIds.map((id) => themeLibrary.find((t) => t.id === id)).filter((t) => t !== undefined);
  const role = productRoles.find((r) => r.id === c.roleId);
  const f = filmStyles.find((s) => s.id === c.styleId);
  return [
    `故事主题：${themes.map((t) => `${t.label}（${t.description}）`).join("；") || "未指定"}`,
    c.freeText.trim() ? `创意要点：${c.freeText.trim()}` : "",
    role ? `产品在剧情中的角色：${role.label}（${role.description}）` : "",
    f
      ? [
          `视觉参考作品：《${f.film}》（${f.director}，${f.year}，${f.genre}）`,
          `- 关键词：${f.keywords.join("、")}`,
          `- 光线：${f.lighting}`,
          `- 镜头与运镜：${f.camera}`,
          `- 构图：${f.composition}`,
          `- 产品拍法：${f.productTreatment}`,
          `- 产品英雄镜头示例：${f.heroShots.join("；")}`,
          `- 注意：${f.caution}`,
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function proposalPrompt(product: LocalProduct | null, c: Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId">) {
  const user = `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(c)}

【任务】
写 3 个方向明显不同的故事提案（例如旅程型、挑战型、情感型，也可以自定方向）。每个提案是一部 4 集 × 45 秒的连续短剧，故事要能体现视觉参考作品的气质，产品按上面的角色推动剧情。
提案用简体中文撰写。

按以下 json 结构输出：
{"proposals":[{"direction":"2–4 字的方向名","title":"剧名","logline":"一句话故事，60–120 字：主角、冲突、产品在剧情中的作用、视觉参考如何体现","episodeArcs":["第 1 集一句话（不超过 40 字）","第 2 集一句话（不超过 40 字）","第 3 集一句话（不超过 40 字）","第 4 集一句话（不超过 40 字）"]}]}`;
  return { system: SYSTEM, user };
}

export function scriptPrompt(input: {
  product: LocalProduct | null;
  creative: LocalCreative;
  proposal: LocalProposal;
  characters: LocalCharacter[];
  egg: EasterEgg | null;
}) {
  const { product, creative, proposal, characters, egg } = input;
  const cast = characters.length
    ? characters
        .map((ch) => `- ${ch.name || "未命名"}：${KIND_LABELS[ch.kind]} · ${ROLE_LABELS[ch.role]} · 出场第 ${ch.episodes.join("、") || "?"} 集${ch.description.trim() ? ` · ${ch.description.trim()}` : ""}`)
        .join("\n")
    : "（尚未选角，可用无名角色，但不要起具体人名）";
  const eggRule = egg
    ? `彩蛋角色：${egg.name}（${egg.species}${egg.notes.trim() ? `，${egg.notes.trim()}` : ""}）。每集在某个场景摘要里安排它出现一次、约 1–3 秒，不说话、不是主角、不主导剧情，动作低风险。`
    : "本项目不使用彩蛋角色。";

  const user = `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(creative)}

【选定提案】
方向：${proposal.direction}
剧名：${proposal.title}
故事：${proposal.logline}
四集弧线：${proposal.episodeArcs.map((a, i) => `第 ${i + 1} 集「${a}」`).join("；")}

【选角】
${cast}

【彩蛋】
${eggRule}

【任务】
按选定提案写完整的四集剧本，每集正好 45 秒。
- 每集 4 个节拍，按顺序为 hook、conflict、turn、cliffhanger（第 4 集最后一个为 resolution）；startSec/endSec 为整数秒，从 0 开始首尾相接，最后一个在 45 结束；intensity 为 1–5 的情绪强度。
- 每集 2–4 个场景。场景摘要用中文写观众看到的画面：人物动作、产品如何出现、光线和机位如何体现视觉参考作品。
- 台词用英文（text），每句附简体中文翻译（translation）。每集英文台词合计不超过 35 个单词，以画面叙事为主。
- speaker 只能是选角里的角色名；旁白或字幕留空字符串。
- 集名、梗概、节拍描述、场景标题和摘要用简体中文；场景标题格式如「外景 · 城市街道 · 夜」。

按以下 json 结构输出（episodes 必须正好 4 个）：
{"episodes":[{"title":"集名","synopsis":"1–2 句梗概","beats":[{"type":"hook","startSec":0,"endSec":10,"description":"这一段发生什么、产品如何出现","intensity":3}],"scenes":[{"heading":"外景 · 城市街道 · 夜","summary":"画面描述","lines":[{"speaker":"角色名","text":"English line","translation":"中文翻译"}]}]}]}`;
  return { system: SYSTEM, user };
}
