// 出图提示词里「补充文字」和其它来源打架时，程序直接删掉打架的那几句（免费、确定性）

const WARDROBE = /\b(wearing|dressed|outfit|t-?shirts?|tees?|jeans|cardigans?|sweaters?|hoodies?|jackets?|pajamas|dress(es)?|shirts?|coats?|sneakers|shoes|boots|leggings|scarf|beanie|overalls|shorts|sandals|sleeves?|pants|skirts?|socks|onesie)\b/i;
const CINEMA = /\b(cinematic|cinema camera|film grain|film still|shallow depth of field|out of focus|bokeh|anamorphic|35mm film)\b/i;

// 反光、闪光：模型会画成产品上的发光点
const GLARE = /\b(glint\w*|gleam\w*|sparkl\w*|shimmer\w*|glow(?:s|ing)?|lens flares?|sun flares?|shin(?:e|es|ing|y))\b/i;
// 括号里的人物外貌（年龄、族裔、头发、衣服）：外貌以家庭库为准
const LOOKS = /\s*\((?=[^()]*\b(?:\d{1,2}|white|black|caucasian|asian|hispanic|latin[oa]|blond\w*|brunette|hair|jeans|shirt|t-shirt|tee|shoes|sneakers|dress)\b)[^()]*\)/gi;
const AGE = /\b\d{1,2}(?:\.\d)?[- ]?(?:years?|yrs?)[- ]old\s*/gi;
const HAIR = /\s*with\s+(?:[\w-]+,?\s+){0,3}(?:hair|curls|ponytails?|braids|pigtails|puffs|buns?)\b/gi;
const ETHNIC = /\b(?:white|black|caucasian|asian|hispanic|latin[oa]|african[- ]american)\s+(?=(?:woman|man|girl|boy|mom|dad|mother|father|toddler|child|kid|lady|guy)\b)/gi;

// AI 编的产品细节（Logo 位置、颜色、材质）：以产品照为准
const PRODUCT_DETAIL = /\b(logo|wordmark|decal|lettering)\b/i;

const clauses = (t: string) => t.split(/(?<=[.;])\s+|;\s*|,\s+/).map((x) => x.trim()).filter(Boolean);

/** 删掉衣服（家庭库里每个人的衣服才算数）和自拍时的电影画风；返回剩下的文字和删掉的句子 */
export function cleanShotNotes(notes: string, opts: { wardrobe: boolean; selfie: boolean }): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const src = opts.wardrobe ? notes.replace(LOOKS, "").replace(AGE, "").replace(HAIR, "").replace(ETHNIC, "") : notes;
  const kept = clauses(src).filter((c) => {
    const bad = (opts.wardrobe && WARDROBE.test(c)) || (opts.selfie && CINEMA.test(c)) || GLARE.test(c) || PRODUCT_DETAIL.test(c);
    if (bad) dropped.push(c);
    return !bad;
  });
  return { text: kept.join(", ").replace(/\.,/g, ".").replace(/,\s*$/, ""), dropped };
}

/** 动作提示词里删掉反光、闪光的句子 */
export function dropGlare(t: string): string {
  return clauses(t).filter((c) => !GLARE.test(c)).join(", ").replace(/\.,/g, ".").replace(/,\s*$/, "");
}

const SIDE_EN = /\b(?:on|in|to|at)\s+the\s+(?:far\s+)?(?:left|right)(?:\s+(?:side|half|third|edge))?(?:\s+of\s+the\s+(?:frame|screen|shot|image|picture))?/gi;
const SIDE_ZH = /在?画面(?:的)?(?:左|右)(?:边|侧|半边|方|半)?/g;
const WEAR_ZH = /穿|T\s*恤|牛仔|外套|衬衫|裙|毛衣|卫衣|夹克|帽子|围巾/;

/** 车里自拍草稿：脸的位置由程序定在画面中间，衣服按家庭资料，AI 写的左右和衣服都删掉（给用户看的和真正出图的一致） */
export function cleanCarDraft(t: string, lang: "en" | "zh"): string {
  if (lang === "zh")
    return t
      .replace(SIDE_ZH, "在画面中间")
      .split(/(?<=[，。；])/)
      .filter((c) => !WEAR_ZH.test(c))
      .join("")
      .replace(/[，；]$/, "。");
  return cleanShotNotes(t.replace(SIDE_EN, "in the middle of the frame"), { wardrobe: true, selfie: false }).text;
}
