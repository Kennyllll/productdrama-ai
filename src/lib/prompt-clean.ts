// 出图提示词里「补充文字」和其它来源打架时，程序直接删掉打架的那几句（免费、确定性）

const WARDROBE = /\b(wearing|dressed|outfit|t-?shirts?|tees?|jeans|cardigans?|sweaters?|hoodies?|jackets?|pajamas|dress(es)?|shirts?|coats?|sneakers|shoes|boots|leggings|scarf|beanie|overalls)\b/i;
const CINEMA = /\b(cinematic|cinema camera|film grain|film still|shallow depth of field|out of focus|bokeh|anamorphic|35mm film)\b/i;

const clauses = (t: string) => t.split(/(?<=[.;])\s+|;\s*|,\s+/).map((x) => x.trim()).filter(Boolean);

/** 删掉衣服（家庭库里每个人的衣服才算数）和自拍时的电影画风；返回剩下的文字和删掉的句子 */
export function cleanShotNotes(notes: string, opts: { wardrobe: boolean; selfie: boolean }): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept = clauses(notes).filter((c) => {
    const bad = (opts.wardrobe && WARDROBE.test(c)) || (opts.selfie && CINEMA.test(c));
    if (bad) dropped.push(c);
    return !bad;
  });
  return { text: kept.join(", ").replace(/\.,/g, ".").replace(/,\s*$/, ""), dropped };
}
