// Hook 库：所有产品共用的开头套路。库里只存套路和属性定义（带示例值），实际的价格、主张在每条视频里填。
// 节日、家庭、场地不进 hook：跟整条视频和正文第一镜走。
import { DEFAULT_STAGE, type HookStage } from "@/lib/hook-stage";
import { isHookEffect, PRESET_EFFECT, type HookEffectId } from "@/lib/hook-effects";
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
  /** 选填（例如赠品）；其余都必填：示例只当提示，不能当真值（价格、卖点不能编） */
  optional?: boolean;
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
  /** 3D 预设：选了这个 Hook 自动摆摄影机、产品朝向和人 */
  stage?: HookStage;
  /** 开头字幕效果（hook-effects.ts，照真实案例定的字体和出现方式）；旧数据没有 = 按名字找预设，找不到用逐词大字 */
  effect?: HookEffectId;
  /** 照案例切镜头：第 seconds 秒切到第二段（单独的首帧和视频）；null = 一镜到底 */
  second?: HookSecond | null;
  /** 第一段默认是自拍（拿手机的人入镜对着前置摄像头，强制开声音） */
  selfie?: boolean;
  /** 第一段的地方：car = 人坐在停着的汽车驾驶座自拍说话，产品不入镜（不用 3D），切镜后第二段才出产品 */
  scene?: "car";
}

export interface HookSecond {
  seconds: number;
  /** 第二段怎么拍（给 AI 看） */
  about: string;
  stage: HookStage;
}

export interface HookDef extends HookData {
  id: string;
  updatedAt: string;
}

const s = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");

function cleanStage(x: unknown): HookStage {
  const d = (x ?? {}) as Partial<HookStage>;
  const n = (v: unknown, lo: number, hi: number, f: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : f);
  const poses = ["stand", "crouch", "ride", "point", "reach", "hold"];
  return {
    dist: n(d.dist, 0.6, 6, DEFAULT_STAGE.dist),
    camH: n(d.camH, 0.3, 2.2, DEFAULT_STAGE.camH),
    lens: n(d.lens, 16, 85, DEFAULT_STAGE.lens),
    view: d.view === "head" || d.view === "side" || d.view === "front34" ? d.view : DEFAULT_STAGE.view,
    ...(d.move === "push" || d.move === "pull" ? { move: d.move } : {}),
    ...(typeof d.fill === "number" && Number.isFinite(d.fill) ? { fill: Math.min(0.9, Math.max(0.2, d.fill)) } : {}),
    ...(typeof d.groundY === "number" && Number.isFinite(d.groundY) ? { groundY: Math.min(0.95, Math.max(0.5, d.groundY)) } : {}),
    people: (Array.isArray(d.people) ? d.people : DEFAULT_STAGE.people)
      .slice(0, 3)
      .map((p) => ({
        kind: p?.kind === "adult" ? ("adult" as const) : ("child" as const),
        pose: (poses.includes(p?.pose as string) ? p.pose : "stand") as HookStage["people"][number]["pose"],
        ...(p?.onProduct && p.kind !== "adult" ? { onProduct: true } : { side: p?.side === "left" || p?.side === "behind" ? p.side : ("right" as const), dist: n(p?.dist, 0.3, 3, 0.7) }),
      })),
  };
}

const secOf = (x: unknown, f: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(4, Math.max(1, Math.round(n * 10) / 10)) : f;
};

export function cleanHookData(x: unknown): HookData | null {
  const d = (x ?? {}) as Partial<HookData>;
  const name = s(d.name, 40);
  if (!name) return null;
  const seen = new Set<string>();
  const fields = (Array.isArray(d.fields) ? d.fields : [])
    .map((f) => ({ key: s(f?.key, 30).replace(/[^\w]/g, ""), label: s(f?.label, 30), example: s(f?.example, 200), visual: Boolean(f?.visual), ...(f?.optional ? { optional: true } : {}) }))
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
    stage: cleanStage(d.stage),
    effect: isHookEffect(d.effect) ? d.effect : (PRESET_EFFECT[name] ?? "claimWords"),
    second: d.second && typeof d.second === "object" ? { seconds: secOf(d.second.seconds, 2), about: s(d.second.about, 400), stage: cleanStage(d.second.stage) } : null,
    selfie: Boolean(d.selfie) || d.scene === "car",
    ...(d.scene === "car" ? { scene: "car" as const } : {}),
  };
}

/** 视频里填的属性值：只留这个 hook 有的属性；没填就是空，示例值只当提示 */
export const cleanHookValues = (lib: Pick<HookData, "fields">, values: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(lib.fields.map((f) => [f.key, (typeof values?.[f.key] === "string" ? values[f.key] : "").trim().slice(0, 200)]));

/** 开头字幕只能放英文（Hook 字体没有中文）：中文产品名只留里面的英文型号，没有就写 this one */
export const captionProduct = (name: string) => name.replace(/[^\x20-\x7E]+/g, " ").replace(/\s{2,}/g, " ").trim() || "this one";

export function fillCaption(tpl: string, values: Record<string, string>, product: string): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => (k === "product" ? captionProduct(product) : (values[k] ?? "")))
    .replace(/\s*(—|-|\||·)\s*$/g, "")
    .replace(/\(\s*\)|（\s*）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 160);
}

export const PRESET_HOOKS: HookData[] = [
  {
    name: "价格开场",
    effect: "priceBox",
    about: "照案例：开头是家长自拍，对着前置摄像头做惊讶反应（捂嘴、睁大眼），产品在身后看得见，顶部白框写现价和原价；第 3 秒切到产品画面。",
    use: "有明显折扣时：黑五、节日促销、限时特价",
    seconds: 3,
    entry: "assembled",
    caption: "{deal}: {price} (was {was})",
    selfie: true,
    stage: { dist: 1.8, camH: 1.4, lens: 24, view: "front34", people: [] },
    second: { seconds: 1.5, about: "切到产品：产品斜前方摆在画面中央，完整清楚，画面里没有人", stage: { dist: 1.4, camH: 0.5, lens: 35, view: "front34", people: [] } },
    fields: [
      { key: "price", label: "现价", example: "$59.99", visual: false },
      { key: "was", label: "原价", example: "$89.99", visual: false },
      { key: "deal", label: "优惠说法", example: "Black Friday deal", visual: false },
      { key: "gift", label: "赠品（画面里会出现）", example: "", visual: true, optional: true },
    ],
  },
  {
    name: "大胆主张",
    effect: "claimWords",
    selfie: false,
    about: "照案例：一句强主张用大字压在画面中间；第一段家长蹲在车旁、和车一样高，看着车跟拍的人说话，第 2 秒切到孩子骑车的画面作证据，不能只是空喊。",
    use: "产品有一个明显、能拍出来的卖点",
    seconds: 2,
    entry: "assembled",
    caption: "{claim}",
    stage: { dist: 2, camH: 0.7, lens: 28, view: "front34", fill: 0.55, people: [{ kind: "adult", pose: "crouch", side: "right", dist: 0.6 }] },
    second: { seconds: 2, about: "切到证据：孩子骑着车，开心、很稳，正好证明那句主张", stage: { dist: 2, camH: 0.6, lens: 28, view: "front34", fill: 0.55, people: [{ kind: "child", pose: "ride", onProduct: true }] } },
    fields: [
      { key: "claim", label: "主张", example: "The only trike my 2-year-old actually rides", visual: false },
      { key: "proof", label: "画面证据", example: "孩子自己踩着脚踏骑过来，很稳", visual: true },
    ],
  },
  {
    name: "先给结果",
    effect: "resultLines",
    second: null,
    selfie: false,
    about: "照案例：一镜到底，第一帧就是结果——从侧面拍孩子骑着车从镜头前经过，上下两行事实小字，不切镜头。让观众想知道怎么做到的，正文再讲过程。",
    use: "使用效果很直观的产品",
    seconds: 3,
    entry: "riding",
    caption: "{line}",
    stage: { dist: 2.4, camH: 0.6, lens: 28, view: "side", fill: 0.4, groundY: 0.75, people: [{ kind: "child", pose: "ride", onProduct: true }] },
    fields: [
      { key: "result", label: "结果画面", example: "孩子在前院自己骑了一圈，家长在旁边拍手", visual: true },
      { key: "line", label: "字幕说法", example: "Day 3 with this trike", visual: false },
    ],
  },
  {
    name: "紧迫感",
    effect: "ticker",
    second: null,
    selfie: false,
    about: "照案例：产品特写，顶部黑条跑马灯写截止时间和库存；第 1.5 秒镜头往后拉开，露出产品全貌。让人觉得现在不买就错过。",
    use: "限时活动、库存不多、节前最后发货日",
    seconds: 3,
    entry: "assembled",
    caption: "{deadline} · {stock}",
    stage: { dist: 0.7, camH: 0.6, lens: 35, view: "front34", people: [], move: "pull" },
    fields: [
      { key: "deadline", label: "截止时间", example: "Sale ends tonight", visual: false },
      { key: "stock", label: "库存", example: "Only 50 left", visual: false },
    ],
  },
  {
    name: "社会认同",
    effect: "comment",
    selfie: false,
    about: "照案例：左上角评论气泡，像在回复网友的评论；第一段家长蹲在车旁看着车，第 1.5 秒切到产品特写换个角度。评论和数字必须是真的。",
    use: "有销量、评分或真实评价可以引用",
    seconds: 1.5,
    entry: "assembled",
    caption: "{proof}",
    stage: { dist: 1.8, camH: 0.6, lens: 28, view: "front34", fill: 0.55, people: [{ kind: "adult", pose: "crouch", side: "left", dist: 0.5 }] },
    second: { seconds: 2, about: "切到产品特写：从侧面近拍，产品完整清楚，画面里没有人", stage: { dist: 1, camH: 0.45, lens: 35, view: "side", people: [] } },
    fields: [{ key: "proof", label: "数字或评价", example: "10,000+ parents gave it 5 stars", visual: false }],
  },
  {
    name: "对比",
    effect: "vsWords",
    second: null,
    selfie: false,
    about: "一秒内对比：旧办法 / 别的产品 vs 这个产品。差别要能在画面里直接看出来，不点名贬低别的品牌。",
    use: "和常见替代品相比有明显优势",
    seconds: 3,
    entry: "assembled",
    caption: "{vs} vs {product}",
    stage: { dist: 1.8, camH: 0.7, lens: 28, view: "side", fill: 0.5, people: [{ kind: "adult", pose: "stand", side: "right", dist: 0.7 }] },
    fields: [
      { key: "vs", label: "和什么比", example: "a heavy metal trike", visual: true },
      { key: "diff", label: "差别（画面里怎么看出来）", example: "妈妈一只手就能拎起这台车", visual: true },
    ],
  },
  {
    name: "车里自拍",
    effect: "talkWords",
    about: "照案例：出镜的人坐在停着的汽车驾驶座上，系着安全带，用手机前置摄像头自拍，对着镜头说话，像跟朋友推荐；这一段产品不入镜。第 4 秒切到产品特写。",
    use: "想要真人口播、像朋友推荐时：种草、分享心得、回答常见问题",
    seconds: 4,
    entry: "assembled",
    caption: "{point}",
    selfie: true,
    scene: "car",
    stage: { dist: 1.8, camH: 1.4, lens: 24, view: "front34", people: [] },
    second: { seconds: 2, about: "切到产品特写：产品斜前方近拍，完整清楚，画面里没有人", stage: { dist: 1.2, camH: 0.5, lens: 35, view: "front34", people: [] } },
    fields: [{ key: "point", label: "切镜后顶部的卖点（必填，只写真有的）", example: "", visual: false }],
  },
];
