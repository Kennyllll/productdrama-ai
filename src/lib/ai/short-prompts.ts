// 产品短视频的 AI 提示词：创意（3–5 个）与分镜。
import { MAX_USD_PER_SECOND, VIDEO_MIN_SEC, VIDEO_USD_PER_SEC, type ShortConcept, type ShortTemplate, type VideoResolution } from "@/lib/shorts";

const RULES = `必须遵守：
- 产品保真：只使用产品资料里写明的信息，不编造功能、配件、颜色、尺寸、认证或数据。
- 面向北美消费者：真实的美国/加拿大家庭、房间、节日和生活细节；人物和场景要让人一看就信，避免明显 AI 感的梦幻场景。
- 不使用任何用户手机实拍素材：所有画面都由平台生成或用产品原始素材合成。
- 产品上的屏幕、投影、灯光图案、包装印刷等显示内容，AI 画不准，必须标在 compositeNote 里，后期用真实素材合成。
- 儿童不做危险动作，不出现不安全使用产品的画面。
- 字幕（caption）用英文，短、口语、像真实 TikTok 博主写的；一屏不超过 12 个单词。`;

/** 只有开箱模板可以出现包装；其他模板里产品一出场就是组装好的成品 */
const packagingRule = (t: ShortTemplate) =>
  t.needsPackaging
    ? "- 包装：只按用户上传的真实包装照片描述包装（颜色、形状、开口方式），不编造包装设计；包装上的印刷写进 compositeNote。"
    : "- 不是开箱视频：整条视频里不出现纸箱、快递箱、包装盒、拆箱、撕包装纸。产品一出场就是组装好的成品（送礼时可以系蝴蝶结、从树后推出、掀开毯子）。";

export function shortConceptPrompt(t: ShortTemplate, product: string, brief: string, existing: string[]) {
  const system = `你是 TikTok 爆款短视频策划，专做儿童/家庭产品的投放素材。你只输出 json。\n${RULES}\n${packagingRule(t)}`;
  const user = `产品资料：
${product}

模板：${t.label} —— ${t.description}
节奏：${t.beats.map((b) => `${b.label}（约 ${b.seconds} 秒）`).join(" → ")}
${brief.trim() ? `用户要求：${brief.trim()}\n` : ""}${existing.length ? `这个产品已经做过的视频（不要重复同样的钩子和场景）：${existing.join("；")}\n` : ""}
给出 4 个明显不同的创意（不同受众 / 节日 / 钩子 / 场景），每个都能在 15–20 秒内讲完。
输出 json：{"concepts":[{"title":"中文短标题","hookCaption":"POV: ...（英文字幕钩子）","ctaCaption":"英文 CTA","audience":"送礼人和收礼人，中文","setting":"具体场景，中文","people":"出场人物：只写是谁和关系（不写年龄、外貌、穿着，外貌由家庭库决定），中文","why":"为什么这个钩子会让人停下来，中文一句"}]}`;
  return { system, user };
}

export function shortShotsPrompt(t: ShortTemplate, product: string, c: ShortConcept, resolution: VideoResolution, look: string, cast = "") {
  const unit = VIDEO_USD_PER_SEC[resolution];
  const system = `你是短视频导演兼剪辑师，按镜头生成竖版 9:16 产品短视频分镜。你只输出 json。\n${RULES}\n${packagingRule(t)}
成本硬约束：成片每秒全部花费不超过 $${MAX_USD_PER_SECOND}。视频模型 ${resolution} 每生成 1 秒 $${unit}，每次最少生成 ${VIDEO_MIN_SEC} 秒，每镜首帧另需约 $0.10。
所以：
- 一共 4–6 个镜头，成片 15–20 秒。
- 2–3 秒的短节拍不要单独成镜：把同一机位、同一地点的相邻动作合进一个 ${VIDEO_MIN_SEC}–6 秒的镜头，剪辑时只用其中一段（useSeconds）。
- genSeconds 为整数，最少 ${VIDEO_MIN_SEC}；useSeconds ≤ genSeconds，尽量接近，避免浪费。
- 每个镜头要能单独由“首帧图 + 运动描述”生成，动作简单清楚，一个镜头只发生一件事。
要像真实的 TikTok 短视频，不要像 AI 生成的：
- 同一组人、同一个家、同一件产品贯穿全片：每个 framePrompt 都写出同样的房间陈设和光线；产品配饰（如蝴蝶结）不变。
- 人物外貌（年龄、族裔、发型、衣服）由家庭库定妆照决定，description 和 framePrompt 里都不写，只写是谁（用家庭成员名字或爸爸/妈妈/孩子）、在做什么、什么表情。
- 镜头之间要有关联，但不必逐帧接戏：像家长用手机拍了几段再剪在一起，可以跳剪、换角度、切反应镜头、跳过一段时间；每镜是这件事的下一个有意思的瞬间，不重复上一镜已经拍到的动作。
- 去掉 AI 感：手机拍摄、构图不完美、自然晃动、真实的生活杂物和普通室内光；动作自然、不慢动作、不电影运镜；人物表情和姿势随意，不摆拍、不对着镜头表演。
- 人物之间要有真实互动：两人以上的镜头写清一来一回，谁先做什么（说话、递东西、伸手帮忙、逗对方、指给对方看），对方怎么回应；表情跟着动作变（说话、笑出声、惊讶、专心），不要整段挂着同一个笑，不要两人只是对视微笑；视线在产品、对方、手上的东西之间换。
- 正文镜头不写推近、拉远、环绕：手持晃动出片时由平台加，camera 只写机位和景别。
- 只用这一家人：不要编另一个家庭、邻居或陌生人（家庭库里没有的人画不准、前后对不上）。需要换场景时，写明是同一家人换到哪里。`;
  const user = `产品资料：
${product}

模板：${t.label}；画面风格：${look === "cinematic" ? "电影感：电影机拍摄、讲究的光线和构图" : "UGC：手机竖拍、自然室内光、轻微手持晃动，像家长随手拍的真实视频"}
节奏：${t.beats.map((b) => `${b.label}（约 ${b.seconds} 秒）：${b.hint}`).join("；")}
创意：${c.title}
- 钩子字幕：${c.hookCaption}
- CTA：${c.ctaCaption}
- 人物：${c.people}
- 场景：${c.setting}
${cast ? `- 家庭：${cast}\n` : ""}
输出 json：{"shots":[{"beat":"节拍名","useSeconds":3,"genSeconds":4,"description":"中文：画面里发生什么","camera":"中文：机位和运动","caption":"本镜顶部英文字幕（钩子段落重复钩子字幕；最后一镜用 CTA）","productNote":"中文：产品在画面里的状态、哪一面朝镜头","compositeNote":"中文：需要后期用真实素材合成的显示内容，没有就留空","framePrompt":"English: detailed first-frame image prompt, 9:16 vertical, describe people, setting, lighting, camera, and where the product sits in frame","motionPrompt":"English: what moves during the clip, camera motion, one clear action"}]}`;
  return { system, user };
}
