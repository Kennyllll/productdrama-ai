// Hook 库：所有产品共用的开头套路。库里只存套路和属性定义（带示例值），实际的价格、主张在每条视频里填。
// 节日、家庭、场地不进 hook：跟整条视频和正文第一镜走。
export type HookEntry = "assembled" | "unbox" | "riding";
export const HOOK_ENTRIES: { id: HookEntry; label: string; en: string }[] = [
  { id: "assembled", label: "已经组装好", en: "the product is already fully assembled and clearly in view (no box, no packaging)" },
  { id: "unbox", label: "拆箱", en: "the product comes out of its real retail box (packaging must match the real packaging photos)" },
  { id: "riding", label: "骑行中", en: "a child is already riding the product" },
];

export interface HookField {
  key: string;
  label: string;
  example: string;
  /** true = 影响画面（改了要重做）；false = 只进字幕（改了免费） */
  visual: boolean;
}

export interface HookData {
  name: string;
  /** 这个开头怎么拍、为什么有效（给 AI 看） */
  about: string;
  /** 什么时候用 */
  use: string;
  seconds: number;
  entry: HookEntry;
  /** 字幕模板：{key} 换成属性值，{product} 换成产品名 */
  caption: string;
  fields: HookField[];
}

export interface HookDef extends HookData {
  id: string;
  updatedAt: string;
}

const s = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

export function cleanHookData(x: unknown): HookData | null {
  const d = (x ?? {}) as Partial<HookData>;
  const name = s(d.name, 40);
  if (!name) return null;
  const seen = new Set<string>();
  const fields = (Array.isArray(d.fields) ? d.fields : [])
    .map((f) => ({ key: s(f?.key, 30).replace(/[^\w]/g, ""), label: s(f?.label, 30), example: s(f?.example, 200), visual: Boolean(f?.visual) }))
    .filter((f) => f.key && f.label && !seen.has(f.key) && f.key !== "product" && seen.add(f.key))
    .slice(0, 8);
  const sec = Number(d.seconds);
  return {
    name,
    about: s(d.about, 600),
    use: s(d.use, 200),
    seconds: Number.isFinite(sec) ? Math.min(4, Math.max(1, Math.round(sec * 10) / 10)) : 3,
    entry: HOOK_ENTRIES.some((e) => e.id === d.entry) ? (d.entry as HookEntry) : "assembled",
    caption: s(d.caption, 200),
    fields,
  };
}

/** 视频里填的属性值：只留这个 hook 有的属性，没填用示例值 */
export const cleanHookValues = (lib: Pick<HookData, "fields">, values: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(lib.fields.map((f) => [f.key, (typeof values?.[f.key] === "string" ? values[f.key] : f.example).trim().slice(0, 200)]));

export function fillCaption(tpl: string, values: Record<string, string>, product: string): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => (k === "product" ? product : (values[k] ?? "")))
    .replace(/\s*(—|-|\||·)\s*$/g, "")
    .replace(/\(\s*\)|（\s*）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 160);
}

export const PRESET_HOOKS: HookData[] = [
  {
    name: "价格开场",
    about: "第一秒就亮价格：产品清楚地出现在画面中央，字幕大字写现价和原价。观众先被价格抓住，再看产品。",
    use: "有明显折扣时：黑五、节日促销、限时特价",
    seconds: 3,
    entry: "assembled",
    caption: "{deal}: {price} (was {was})",
    fields: [
      { key: "price", label: "现价", example: "$59.99", visual: false },
      { key: "was", label: "原价", example: "$89.99", visual: false },
      { key: "deal", label: "优惠说法", example: "Black Friday deal", visual: false },
      { key: "gift", label: "赠品（画面里会出现）", example: "", visual: true },
    ],
  },
  {
    name: "大胆主张",
    about: "第一秒说一句让人想看下去的强主张，画面立刻给出支撑这句话的证据，不能只是空喊。",
    use: "产品有一个明显、能拍出来的卖点",
    seconds: 3,
    entry: "riding",
    caption: "{claim}",
    fields: [
      { key: "claim", label: "主张", example: "The only trike my 2-year-old actually rides", visual: false },
      { key: "proof", label: "画面证据", example: "孩子自己踩着脚踏骑过来，很稳", visual: true },
    ],
  },
  {
    name: "先给结果",
    about: "先放最好的结果画面（孩子开心地骑、家长很轻松），让观众想知道怎么做到的，正文再讲过程。",
    use: "使用效果很直观的产品",
    seconds: 3,
    entry: "riding",
    caption: "{line}",
    fields: [
      { key: "result", label: "结果画面", example: "孩子在前院自己骑了一圈，家长在旁边拍手", visual: true },
      { key: "line", label: "字幕说法", example: "Day 3 with this trike", visual: false },
    ],
  },
  {
    name: "紧迫感",
    about: "字幕强调时间或库存快没了；画面里产品清楚可见、状态最好看，让人觉得现在不买就错过。",
    use: "限时活动、库存不多、节前最后发货日",
    seconds: 3,
    entry: "assembled",
    caption: "{deadline} · {stock}",
    fields: [
      { key: "deadline", label: "截止时间", example: "Sale ends tonight", visual: false },
      { key: "stock", label: "库存", example: "Only 50 left", visual: false },
    ],
  },
  {
    name: "社会认同",
    about: "开头用数字或真实评价建立信任：画面是一个普通家庭在用产品，字幕写销量或评价。数字必须是真的。",
    use: "有销量、评分或真实评价可以引用",
    seconds: 3,
    entry: "riding",
    caption: "{proof}",
    fields: [{ key: "proof", label: "数字或评价", example: "10,000+ parents gave it 5 stars", visual: false }],
  },
  {
    name: "对比",
    about: "一秒内对比：旧办法 / 别的产品 vs 这个产品。差别要能在画面里直接看出来，不点名贬低别的品牌。",
    use: "和常见替代品相比有明显优势",
    seconds: 3,
    entry: "assembled",
    caption: "{vs} vs {product}",
    fields: [
      { key: "vs", label: "和什么比", example: "a heavy metal trike", visual: true },
      { key: "diff", label: "差别（画面里怎么看出来）", example: "妈妈一只手就能拎起这台车", visual: true },
    ],
  },
];
