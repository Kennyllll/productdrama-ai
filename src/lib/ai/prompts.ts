// AI 提示词（TASK-006 / 007 / 009）。只发送文字资料，不发送照片。
import { STORY_CORE_FIELDS } from "@/lib/creative";
import { filmStyles, productRoles, themeLibrary } from "@/lib/mock/demo";
import { angles, cameraMoves, lenses, presences, shotSizes, transitions } from "@/lib/storyboard";
import type { CharacterKind, CharacterRole, EasterEgg, LocalCharacter, LocalCreative, LocalProduct, LocalProposal, LocalScript, StoryCore } from "@/lib/types";

const KIND_LABELS: Record<CharacterKind, string> = { child: "儿童", adult: "成人", animal: "动物", fantasy: "幻想角色" };
const ROLE_LABELS: Record<CharacterRole, string> = { lead: "主角", supporting: "配角", cameo: "客串", extra: "群演" };

const BASE_RULES = `必须遵守：
- 电影级：画面叙事为主，台词少而精；每集有钩子、冲突、转折和结尾悬念（第 4 集为收束）。
- 产品保真：只使用产品资料里写明的信息，不编造功能、配件、颜色、尺寸、认证或数据。
- 视觉参考只借鉴光线、色彩、机位、构图和节奏；不复制原作角色、台词、情节、标志性镜头、Logo、字体或音乐。
- 视觉参考只决定光线、色彩、机位、构图和剪辑节奏，不改变人物、情节和情感走向；风格与故事气质有反差时，用视觉语言服务故事（例如用大片拍法拍孩子眼中的小冒险），不要为了迎合风格去改剧情。
- 儿童角色不做危险动作，不出现不安全使用产品的画面。`;

const EMPATHY_RULES = `共情要求（最重要，比展示产品更重要）：
- 具体：主角是一个具体的人，有只属于他的细节（一件物品、一个习惯、一句口头禅、一个心结），观众一看就记住。
- 代价：每一集都要有真实的失去风险，观众要为他担心。
- 升级：四集的情绪和代价逐集升级，第 3 集是最低谷；不能每集重复同一种情绪。
- 反转：每集结尾的悬念要改变观众对前面内容的理解，而不只是「下集继续」。
- 呼应：第 1 集埋下的细节，在第 4 集以出乎意料的方式回收（setup / payoff）。
- 潜台词：台词不直接说出情绪，靠动作、眼神和细节表达。
- 人先于产品：观众共情的是人物的选择和表情；产品在关键时刻成为帮人物跨过情感难关的桥梁，不做功能展示或口播。`;

const SYSTEM = `你是一位资深电影导演兼编剧，为电商品牌制作电影级连续产品短剧（4 集，每集 45 秒），面向海外市场。
你只输出 json，不输出任何解释。

${BASE_RULES}

${EMPATHY_RULES}`;

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

function storyCoreBlock(core: StoryCore | undefined): string {
  if (!core) return "";
  const lines = STORY_CORE_FIELDS.filter((f) => core[f.key].trim()).map((f) => `- ${f.label}：${core[f.key].trim()}`);
  return lines.length ? `故事内核（必须围绕它展开）：\n${lines.join("\n")}` : "";
}

type CreativeInput = Pick<LocalCreative, "themeIds" | "freeText" | "styleId" | "roleId"> & { storyCore?: StoryCore };

function creativeBlock(c: CreativeInput, withCore = true): string {
  const themes = c.themeIds.map((id) => themeLibrary.find((t) => t.id === id)).filter((t) => t !== undefined);
  const role = productRoles.find((r) => r.id === c.roleId);
  const f = filmStyles.find((s) => s.id === c.styleId);
  return [
    `故事主题：${themes.map((t) => `${t.label}（${t.description}）`).join("；") || "未指定"}`,
    c.freeText.trim() ? `创意要点：${c.freeText.trim()}` : "",
    role ? `产品在剧情中的角色：${role.label}（${role.description}）` : "",
    withCore ? storyCoreBlock(c.storyCore) : "",
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

function castBlock(characters: LocalCharacter[]): string {
  return characters.length
    ? characters
        .map((ch) => `- ${ch.name || "未命名"}：${KIND_LABELS[ch.kind]} · ${ROLE_LABELS[ch.role]} · 出场第 ${ch.episodes.join("、") || "?"} 集${ch.description.trim() ? ` · ${ch.description.trim()}` : ""}`)
        .join("\n")
    : "（尚未选角，可用无名角色，但不要起具体人名）";
}

export function storyCorePrompt(product: LocalProduct | null, c: CreativeInput, characters: LocalCharacter[]) {
  const styles = filmStyles.map((f) => `《${f.film}》（${f.genre}）`).join("、");
  const user = `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(c, false)}

【选角】
${castBlock(characters)}

【任务】
在写任何情节之前，先提炼这部短剧的故事内核。想清楚：谁会看、他们心里真正在意什么；主角是怎样一个具体的人；他想要什么、真正需要什么、失败会失去什么；观众最后应该带走什么感受；产品在哪个关键时刻帮人物跨过情感难关。
已选角时，主角和配角必须使用选角里的名字、年龄和设定，只能补充细节，不能改名、改年龄。写法要具体、有画面感，避免空泛的形容词。用简体中文。

再判断所选视觉参考作品的气质是否适合这个情感（只作提示，用户可以有意保留反差）。如果不适合，说明反差会带来什么效果，并从以下作品中推荐 1–2 部更贴合的：${styles}。

按以下 json 结构输出：
{"storyCore":{"audience":"观众与情感痛点","protagonist":"主角：名字、年龄、一个只属于他的细节或心结","want":"外在目标","need":"内在需要","stakes":"失败会失去什么","truth":"想让观众记住的一句话","productBridge":"产品如何在关键时刻成为情感桥梁","styleNote":"参考作品是否匹配及推荐"}}`;
  return { system: SYSTEM, user };
}

export function proposalPrompt(product: LocalProduct | null, c: CreativeInput, characters: LocalCharacter[]) {
  const user = `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(c)}

【选角】
${castBlock(characters)}

【任务】
写 3 个方向明显不同的故事提案（例如旅程型、挑战型、情感型，也可以自定方向）。每个提案是一部 4 集 × 45 秒的连续短剧，必须围绕故事内核，满足全部共情要求，人物名字和年龄与选角一致；故事要能体现视觉参考作品的气质，产品按上面的角色推动剧情。
提案用简体中文撰写。

按以下 json 结构输出：
{"proposals":[{"direction":"2–4 字的方向名","title":"剧名","logline":"一句话故事，60–120 字：具体的主角、他会失去什么、产品在关键时刻的作用、视觉参考如何体现","episodeArcs":["第 1 集一句话（不超过 40 字）","第 2 集一句话（不超过 40 字）","第 3 集一句话（不超过 40 字）","第 4 集一句话（不超过 40 字）"]}]}`;
  return { system: SYSTEM, user };
}

const SCRIPT_SCHEMA = `{"episodes":[{"title":"集名","synopsis":"1–2 句梗概","beats":[{"type":"hook","startSec":0,"endSec":10,"description":"这一段发生什么、产品如何出现","intensity":3}],"scenes":[{"heading":"外景 · 城市街道 · 夜","summary":"画面描述","lines":[{"speaker":"角色名","text":"English line","translation":"中文翻译"}]}]}]}`;

const SCRIPT_FORMAT = `- 每集 4 个节拍，按顺序为 hook、conflict、turn、cliffhanger（第 4 集最后一个为 resolution）；startSec/endSec 为整数秒，从 0 开始首尾相接，最后一个在 45 结束；intensity 为 1–5 的情绪强度。
- 每集 2–4 个场景。场景摘要用中文写观众看到的画面：人物的动作和表情、产品如何出现、光线和机位如何体现视觉参考作品。
- 台词用英文（text），每句附简体中文翻译（translation）。每集英文台词合计不超过 35 个单词，以画面叙事为主。
- speaker 只能是选角里的角色名；旁白或字幕留空字符串。
- 集名、梗概、节拍描述、场景标题和摘要用简体中文；场景标题格式如「外景 · 城市街道 · 夜」。`;

interface ScriptInput {
  product: LocalProduct | null;
  creative: LocalCreative;
  proposal: LocalProposal;
  characters: LocalCharacter[];
  egg: EasterEgg | null;
}

function scriptContext({ product, creative, proposal, characters, egg }: ScriptInput): string {
  const eggRule = egg
    ? `彩蛋角色：${egg.name}（${egg.species}${egg.notes.trim() ? `，${egg.notes.trim()}` : ""}）。每集在某个场景摘要里安排它出现一次、约 1–3 秒，不说话、不是主角、不主导剧情，动作低风险。`
    : "本项目不使用彩蛋角色。";
  return `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(creative)}

【选定提案】
方向：${proposal.direction}
剧名：${proposal.title}
故事：${proposal.logline}
四集弧线：${proposal.episodeArcs.map((a, i) => `第 ${i + 1} 集「${a}」`).join("；")}

【选角】
${castBlock(characters)}

【彩蛋】
${eggRule}`;
}

export function scriptPrompt(input: ScriptInput) {
  const user = `${scriptContext(input)}

【任务】
按选定提案写完整的四集剧本，每集正好 45 秒，满足全部共情要求。
${SCRIPT_FORMAT}

按以下 json 结构输出（episodes 必须正好 4 个）：
${SCRIPT_SCHEMA}`;
  return { system: SYSTEM, user };
}

const CRITIC_SYSTEM = `你是一位极其挑剔的电影监制，审过上千部广告短片。你只关心一件事：观众会不会被打动。
你只输出 json，不输出任何解释。

${BASE_RULES}

${EMPATHY_RULES}`;

export const REVIEW_CRITERIA = ["具体性", "代价", "升级", "反转", "共情", "产品自然度"] as const;

export function criticPrompt(input: ScriptInput, draft: LocalScript) {
  const user = `${scriptContext(input)}

【编剧初稿】
${JSON.stringify({ episodes: draft.episodes.map(({ title, synopsis, beats, scenes }) => ({ title, synopsis, beats, scenes: scenes.map(({ heading, summary, lines }) => ({ heading, summary, lines: lines.map(({ speaker, text, translation }) => ({ speaker, text, translation })) })) })) })}

【任务】
1. 按 ${REVIEW_CRITERIA.join("、")} 给初稿打 1–10 分（10 分为顶级院线短片水准），直言列出最致命的 3–6 个问题（具体到第几集哪一段）。
2. 直接改写出你认可的版本：保留选定提案的方向和角色，修掉所有问题，满足全部共情要求。
${SCRIPT_FORMAT}

按以下 json 结构输出（episodes 必须正好 4 个）：
{"review":{"scores":{${REVIEW_CRITERIA.map((c) => `"${c}":5`).join(",")}},"problems":["问题"]},"episodes":${SCRIPT_SCHEMA.slice('{"episodes":'.length, -1)}}`;
  return { system: CRITIC_SYSTEM, user };
}

export function storyboardPrompt(input: {
  product: LocalProduct | null;
  creative: LocalCreative;
  script: LocalScript;
  characters: LocalCharacter[];
  egg: EasterEgg | null;
}) {
  const { product, creative, script, characters, egg } = input;
  const eggRule = egg
    ? `彩蛋角色：${egg.name}（${egg.species}）。每集恰好 1 个镜头 easterEgg 为 true：它在画面中出现约 1–3 秒，不说话、不抢主角，动作低风险。`
    : "本项目不使用彩蛋角色，所有镜头 easterEgg 为 false。";
  const scriptText = script.episodes
    .map((ep) =>
      [
        `第 ${ep.number} 集《${ep.title}》：${ep.synopsis}`,
        ...ep.beats.map((b) => `  [${b.type} ${b.startSec}–${b.endSec}s] ${b.description}`),
        ...ep.scenes.flatMap((s) => [
          `  场景：${s.heading} — ${s.summary}`,
          ...s.lines.filter((l) => l.text.trim()).map((l) => `    ${l.speaker || "旁白"}: ${l.text}`),
        ]),
      ].join("\n"),
    )
    .join("\n\n");

  const user = `【产品资料】
${productBlock(product)}

【创意选择】
${creativeBlock(creative)}

【选角】
${castBlock(characters)}

【彩蛋】
${eggRule}

【四集剧本】
${scriptText}

【任务】
你是这部短剧的导演和摄影指导。按剧本为四集分别设计分镜，镜头首先服务人物情绪。
- 每集 6–8 个镜头，按顺序覆盖全部节拍；seconds 为 1–10 的整数，每集合计正好 45 秒。
- 以下字段只能从给定选项中选：
  size：${shotSizes.join(" / ")}
  angle：${angles.join(" / ")}
  camera：${cameraMoves.join(" / ")}
  transition：${transitions.join(" / ")}
  product：${presences.join(" / ")}
  lens（毫米，数字）：${lenses.join(" / ")}
- 共情：每集至少 2 个人物面部反应的近景或特写（product 不为「主体」），让观众看清人物的情绪变化；关键情绪时刻给足时长。
- 产品：每集只安排 1–2 个 product 为「主体」的镜头，放在情感转折点，并在 productNote 写清产品如何出现（角度、光线、动作、对焦），产品几何、颜色和 Logo 保持不变；其他镜头产品可在背景或不出现。
- 电影语言：景别有远近节奏，相邻镜头避免同景别同机位跳切；焦距与景别匹配，产品为主体时用 50mm 以上，避免广角变形；单镜头不超过 10 秒。
- composition、lighting 按参考作品写具体做法，同时服务这一刻的情绪，不要泛泛而谈。
- dialogue：把剧本台词按顺序放进对应镜头，格式「角色名: English line」；不新增、不改写台词；大多数镜头没有台词。
- characters：本镜头出场的角色名，只能用选角里的名字。
- sound 写声音设计（环境声、细节音效、音乐情绪的进出），continuity 写轴线与动作连续性备注；description、composition、lighting、productNote、sound、continuity 用简体中文。

按以下 json 结构输出（episodes 必须正好 4 个）：
{"episodes":[{"number":1,"shots":[{"seconds":6,"description":"画面描述","size":"远景","lens":24,"angle":"低机位","camera":"推近","composition":"构图","lighting":"光线","transition":"硬切","product":"背景","productNote":"","characters":["角色名"],"dialogue":"","easterEgg":false,"sound":"声音设计","continuity":"连续性备注"}]}]}`;
  return { system: SYSTEM, user };
}
