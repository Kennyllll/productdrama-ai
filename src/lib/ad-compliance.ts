// 广告合规自查（免费、本地规则，纯函数）：价格 / 原价 / 库存 / 评分 / 评论数要有依据；绝对化用语和儿童安全说法给警告。
// 依据存在产品上（产品资料 → 第 5 步「广告里的数字」），每条视频的字幕、台词都拿来对照。

export interface AdFacts {
  /** 现价（例如 59.99），currency 默认 USD */
  price: string;
  priceSource: string;
  /** 原价 / 划线价：必须真实卖过 */
  was: string;
  wasSource: string;
  stock: string;
  stockSource: string;
  rating: string;
  ratingSource: string;
  reviews: string;
  reviewsSource: string;
  /** 安全认证（例如 ASTM F963、CPSC）和检测报告出处 */
  safety: string;
  safetySource: string;
}

export const EMPTY_FACTS: AdFacts = { price: "", priceSource: "", was: "", wasSource: "", stock: "", stockSource: "", rating: "", ratingSource: "", reviews: "", reviewsSource: "", safety: "", safetySource: "" };

export const FACT_KEYS = Object.keys(EMPTY_FACTS) as (keyof AdFacts)[];

export type IssueLevel = "block" | "warn";
export interface AdIssue {
  level: IssueLevel;
  /** 哪段文字：例如「开头 价格开场 · 字幕」 */
  where: string;
  /** 命中的原文 */
  hit: string;
  /** 白话原因 + 怎么改 */
  why: string;
}

const s = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

export function cleanFacts(x: unknown): AdFacts {
  const d = (x ?? {}) as Partial<Record<keyof AdFacts, unknown>>;
  return Object.fromEntries(FACT_KEYS.map((k) => [k, s(d[k], k.endsWith("Source") ? 300 : 80)])) as unknown as AdFacts;
}

/** "$59.99" / "59,99" / "USD 59.99" → 59.99；不是金额 = null */
export function parseMoney(x: string): number | null {
  const m = x.replace(/,(\d{2})$/, ".$1").replace(/,/g, "").match(/^\s*(?:USD|US\$|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:USD)?\s*$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 产品资料里填的依据本身对不对：有数字就要有出处；原价必须高于现价 */
export function factsErrors(f: AdFacts): Partial<Record<keyof AdFacts, string>> {
  const e: Partial<Record<keyof AdFacts, string>> = {};
  const price = f.price ? parseMoney(f.price) : null;
  const was = f.was ? parseMoney(f.was) : null;
  if (f.price && price === null) e.price = "现价请填金额，例如 59.99";
  if (f.was && was === null) e.was = "原价请填金额，例如 89.99";
  if (f.was && !f.price) e.was = "填了原价，也要填现价";
  if (price !== null && was !== null && was <= price) e.was = `原价 $${was} 不高于现价 $${price}：不能写成打折`;
  const pairs: [keyof AdFacts, keyof AdFacts, string][] = [
    ["price", "priceSource", "现价"],
    ["was", "wasSource", "原价"],
    ["stock", "stockSource", "库存"],
    ["rating", "ratingSource", "评分"],
    ["reviews", "reviewsSource", "评论数"],
    ["safety", "safetySource", "安全认证"],
  ];
  for (const [v, src, label] of pairs) if (f[v] && !f[src]) e[src] = `填了${label}，要写依据（店铺链接、截图文件名或报告编号）`;
  if (f.rating && !/^\d(\.\d)?$/.test(f.rating.replace(/\s*(stars?|星|\/\s*5)\s*$/i, "")) ) e.rating = "评分请填数字，例如 4.8";
  if (f.reviews && !/^\d[\d,]*\+?$/.test(f.reviews.replace(/\s/g, ""))) e.reviews = "评论数请填数字，例如 1200";
  return e;
}

const has = (f: AdFacts, k: keyof AdFacts) => !!f[k] && !!f[`${k}Source` as keyof AdFacts] && !factsErrors(f)[k];
const MONEY_RE = /(?:US)?\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|dollars?)\b/gi;
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const ABSOLUTE: { re: RegExp; why: string }[] = [
  { re: /\b(best|greatest)\b(?![- ]?(?:friend|buddy))/i, why: "绝对化用语：说“最好”要有第三方排名或评测出处，TikTok 和 FTC 都会查。没有就改成能拍出来的事实，例如 “folds in 3 seconds”。" },
  { re: /#\s?1\b|\bnumber\s?one\b|\bno\.\s?1\b/i, why: "“第一 / #1”要有排名出处（哪个榜、哪天）。没有就删掉。" },
  { re: /\bthe only\b|\bonly one\b/i, why: "“唯一”很难证明，容易被判虚假宣传。改成具体卖点。" },
  { re: /\bguarantee[ds]?\b|\b100\s?%/i, why: "“保证 / 100%”是承诺，要有真实的保修或退款条款才能写。" },
  { re: /\b(perfect|never\s+(?:breaks?|tips?|falls?))\b/i, why: "绝对化说法（完美、永远不会…），平台会限流。改成具体事实。" },
  { re: /最(?!近|后|初|少)|第一|唯一|顶级|极致/, why: "中文绝对化用语（最、第一、唯一），海外广告也会被判虚假宣传。改成具体事实。" },
];
const SAFETY_RE = /\b(safest|safe|safety|non-?toxic|bpa[- ]?free|certified|astm|cpsc|en\s?71|anti-?tip|tip-?proof|crash-?proof|injury|child-?safe)\b|安全|无毒|防翻|认证/i;
const STOCK_RE = /\bonly\s+\d+\s+(?:left|in stock|remaining)\b|\b\d+\s+(?:left|in stock|remaining)\b|\blow stock\b|\bselling out\b|\bsold out\b|仅剩|库存/i;
const RATING_RE = /\b\d(?:\.\d)?\s?(?:-?\s?stars?|★|\/\s?5)\b|★{3,}|\b5\s?stars?\b|星好评|评分/i;
const REVIEWS_RE = /\b\d[\d,]*\+?\s?k?\+?\s+(?:reviews?|ratings?|parents|families|customers|moms|buyers|sold)\b|评论|好评/i;

/** 一段要出现在成片里的文字（字幕、台词） */
export interface AdText {
  where: string;
  text: string;
}

export function checkAdText(texts: AdText[], facts: AdFacts): AdIssue[] {
  const out: AdIssue[] = [];
  const price = has(facts, "price") ? parseMoney(facts.price) : null;
  const was = has(facts, "was") ? parseMoney(facts.was) : null;
  for (const { where, text } of texts) {
    const t = text.trim();
    if (!t) continue;
    const money = [...t.matchAll(MONEY_RE)].map((m) => ({ hit: m[0], n: parseMoney(m[0].replace(/\s?(USD|dollars?)$/i, "")) }));
    for (const m of money) {
      if (m.n === null) continue;
      const isWas = new RegExp(`(was|reg\\.?|regular|originally|原价|划线)\\W{0,3}${m.hit.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")}`, "i").test(t);
      if (isWas) {
        if (was === null) out.push({ level: "block", where, hit: m.hit, why: "写了原价，但产品资料里没有原价和依据（真实卖过这个价的店铺链接或截图）。FTC 要求原价必须真实卖过。" });
        else if (!near(was, m.n)) out.push({ level: "block", where, hit: m.hit, why: `原价和产品资料里登记的 $${was} 不一致。` });
        else if (price !== null && was <= price) out.push({ level: "block", where, hit: m.hit, why: "原价不高于现价，不能写成打折。" });
      } else if (price === null) out.push({ level: "block", where, hit: m.hit, why: "写了价格，但产品资料里没有现价和依据（店铺链接或截图）。" });
      else if (!near(price, m.n) && !(was !== null && near(was, m.n))) out.push({ level: "block", where, hit: m.hit, why: `价格和产品资料里登记的现价 $${price} 不一致。如果这是原价，写成 “was $…” 并在产品资料第 5 步登记原价和依据。` });
    }
    const stock = t.match(STOCK_RE);
    if (stock && !has(facts, "stock")) out.push({ level: "block", where, hit: stock[0], why: "写了库存 / 快卖完，但产品资料里没有库存和依据。虚假紧迫感会被平台下架。" });
    const rating = t.match(RATING_RE);
    if (rating && !has(facts, "rating")) out.push({ level: "block", where, hit: rating[0], why: "写了评分，但产品资料里没有评分和依据（店铺评分截图）。" });
    const reviews = t.match(REVIEWS_RE);
    if (reviews && !has(facts, "reviews")) out.push({ level: "block", where, hit: reviews[0], why: "写了评论数 / 用户数，但产品资料里没有这个数字和依据。" });
    for (const a of ABSOLUTE) {
      const m = t.match(a.re);
      if (m) out.push({ level: "warn", where, hit: m[0], why: a.why });
    }
    const safe = t.match(SAFETY_RE);
    if (safe)
      out.push({
        level: "warn",
        where,
        hit: safe[0],
        why: has(facts, "safety")
          ? `儿童安全说法：确认和登记的认证（${facts.safety}）说的是同一件事，不要扩大（例如有 ASTM 不等于 “safest”）。`
          : "儿童安全说法要有检测报告（ASTM F963 / CPSC 等），CPSC 和平台都会查。没有就改成能拍出来的事实，例如 “wide wheelbase, low seat”。",
      });
  }
  return out;
}
