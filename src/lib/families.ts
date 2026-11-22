// 家庭库（所有产品共用）：每家几个成员，每人有身高、长相、平时衣服、每个节日自己的衣服和定妆照。纯函数，服务端和客户端共用。
import type { FigureKind } from "@/lib/figures";

export type MemberRole = "dad" | "mom" | "son" | "daughter" | "grandma" | "grandpa" | "other";
export const MEMBER_ROLES: { id: MemberRole; label: string; kind: FigureKind }[] = [
  { id: "dad", label: "爸爸", kind: "adult" },
  { id: "mom", label: "妈妈", kind: "adult" },
  { id: "son", label: "儿子", kind: "child" },
  { id: "daughter", label: "女儿", kind: "child" },
  { id: "grandma", label: "外婆 / 奶奶", kind: "adult" },
  { id: "grandpa", label: "外公 / 爷爷", kind: "adult" },
  { id: "other", label: "其他", kind: "adult" },
];
export const roleOf = (r: MemberRole) => MEMBER_ROLES.find((x) => x.id === r) ?? MEMBER_ROLES[MEMBER_ROLES.length - 1];

/** 有自己衣服的节日（THEMES 里去掉「无节日」「自定义」） */
export const WEAR_THEMES: { id: string; label: string }[] = [
  { id: "christmas", label: "圣诞" },
  { id: "cny", label: "春节" },
  { id: "halloween", label: "万圣节" },
  { id: "thanksgiving", label: "感恩节" },
  { id: "birthday", label: "生日" },
  { id: "easter", label: "复活节" },
];
/** 定妆照的「造型」：daily = 平时衣服，其余 = 节日 id */
export const DAILY = "daily";
export const lookLabel = (look: string) => (look === DAILY ? "平时" : (WEAR_THEMES.find((t) => t.id === look)?.label ?? look));

/** 中文给人看，英文进提示词 */
export interface Bi {
  zh: string;
  en: string;
}
/** 一张定妆照：出图时用的长相和衣服记下来，文字改了就知道照片过期 */
export interface Portrait {
  file: string;
  usd: number;
  at: string;
  look: string;
  wear: string;
}
/** 正在出的定妆照（存库里：断线 / 重启后用同一个幂等键续等，不重复扣费） */
export interface PortraitJob {
  key: string;
  requestId?: string;
  usd: number;
  at: string;
  look: string;
  wear: string;
  error?: string;
}
export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  age: number;
  heightCm: number;
  look: Bi;
  wear: Bi;
  /** 每个节日这个人自己穿的衣服（THEMES id）；没写的节日穿平时衣服 */
  themeWear: Record<string, Bi>;
  /** 采用的定妆照，按造型（daily / 节日 id） */
  portraits?: Record<string, Portrait>;
  /** 出好了等审批的定妆照 */
  portraitDrafts?: Record<string, Portrait>;
  portraitJobs?: Record<string, PortraitJob>;
}
export interface FamilyData {
  name: string;
  /** 一句话：族裔、住什么样的房子 */
  about: Bi;
  members: FamilyMember[];
}
export interface Family extends FamilyData {
  id: string;
  updatedAt: string;
}

/** 3D 编辑器里给人偶选的成员 */
export interface CastOption {
  id: string;
  name: string;
  kind: FigureKind;
  h: number;
  label: string;
  role?: MemberRole;
}

export const memberKind = (m: Pick<FamilyMember, "role" | "age">): FigureKind => (m.age >= 14 ? "adult" : "child");

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const bi = (v: unknown, n = 300): Bi => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { zh: str(o.zh, n), en: str(o.en, n) };
};
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
function wearMap(v: unknown): Record<string, Bi> {
  const tw = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, Bi> = {};
  for (const [k, w] of Object.entries(tw).slice(0, 20)) {
    const b = bi(w);
    if (/^[a-z-]{1,20}$/.test(k) && (b.zh || b.en)) out[k] = b;
  }
  return out;
}

/** 页面提交的家庭资料：定妆照字段不收（只由服务器写）；旧数据的「整家同款」节日衣服分给没写的人 */
export function cleanFamily(v: unknown): FamilyData | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const name = str(o.name, 40);
  if (!name) return null;
  const legacy = wearMap(o.themeWear);
  const seen = new Set<string>();
  const members = (Array.isArray(o.members) ? o.members : []).slice(0, 8).flatMap((m): FamilyMember[] => {
    const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const id = typeof x.id === "string" && /^[a-z0-9-]{1,40}$/.test(x.id) && !seen.has(x.id) ? x.id : "";
    const nm = str(x.name, 30);
    if (!id || !nm) return [];
    seen.add(id);
    const role = MEMBER_ROLES.find((r) => r.id === x.role)?.id ?? "other";
    return [
      {
        id,
        name: nm,
        role,
        age: Math.round(num(x.age, 0, 99, 30) * 10) / 10,
        heightCm: Math.round(num(x.heightCm, 60, 210, roleOf(role).kind === "adult" ? 170 : 95)),
        look: bi(x.look),
        wear: bi(x.wear),
        themeWear: { ...legacy, ...wearMap(x.themeWear) },
      },
    ];
  });
  return { name, about: bi(o.about), members };
}

/** 这个人在这个节日穿什么（英文进提示词）；节日没写 = 平时衣服 */
export const wearOf = (m: FamilyMember, theme: string): string => m.themeWear?.[theme]?.en || m.wear.en;

/** 进提示词的一句话：“Leo, a 3-year-old boy, light brown curly hair, wearing …” */
/** face=false：拿手机的人脸永远不出镜，只写名字、年龄和衣服（手和袖子会入镜） */
export function memberText(m: FamilyMember, theme: string, face = true): string {
  const age = m.age < 1 ? "baby" : m.age < 14 ? `${Math.round(m.age * 2) / 2}-year-old ${m.role === "daughter" ? "girl" : m.role === "son" ? "boy" : "child"}` : `${Math.round(m.age)}-year-old ${m.role === "mom" || m.role === "grandma" ? "woman" : m.role === "dad" || m.role === "grandpa" ? "man" : "adult"}`;
  const wear = wearOf(m, theme);
  return [`${m.name}, a ${age}`, face ? m.look.en : "", wear ? `wearing ${wear}` : ""].filter(Boolean).join(", ");
}

/** 定妆照状态：认脸只要长相没改；衣服也对得上才算这个造型的照片 */
export function portraitState(m: FamilyMember, p: Portrait | undefined, look: string): "none" | "ok" | "wear" | "stale" {
  if (!p) return "none";
  if (p.look !== m.look.en) return "stale";
  return p.wear === wearOf(m, look === DAILY ? "none" : look) ? "ok" : "wear";
}

/** 首帧认人用哪张定妆照：这个节日自己的 → 平时的（只认脸，衣服按文字）；长相改过的不用 */
export function portraitFor(m: FamilyMember, theme: string): { p: Portrait; outfit: boolean } | null {
  const own = m.themeWear?.[theme]?.en ? m.portraits?.[theme] : undefined;
  if (own && portraitState(m, own, theme) === "ok") return { p: own, outfit: true };
  const d = m.portraits?.[DAILY];
  const st = portraitState(m, d, DAILY);
  if (!d || st === "stale" || st === "none") return null;
  return { p: d, outfit: st === "ok" && !m.themeWear?.[theme]?.en };
}

/** 定妆照提示词（Sunburst）：平时的只靠文字；节日的拿平时那张认脸，只换衣服 */
export function portraitPrompt(f: Pick<FamilyData, "about">, m: FamilyMember, look: string, hasBase: boolean): string {
  const theme = look === DAILY ? "none" : look;
  const kid = memberKind(m) === "child";
  const from = f.about.en.replace(/\s+(in|with)\b.*$/, "");
  return [
    "Character casting photo for a family TikTok video: one real person, full body from the top of the head to the shoes, standing straight in the middle of the frame on a plain light gray studio background, facing the camera, arms relaxed at the sides, natural friendly expression.",
    "An ordinary-looking real person with natural skin texture, not a fashion model, not a 3D render, cartoon or illustration. Soft even daylight, sharp focus, vertical photo.",
    look !== DAILY && hasBase
      ? `Image 1 is the approved casting photo of ${m.name}. Keep exactly the same person: same face, age, hair, skin tone and body. Change only the clothes to: ${wearOf(m, theme)}.`
      : "",
    `This person is ${memberText(m, theme)}, from ${from}.`,
    kid ? `A real ${Math.round(m.age * 2) / 2}-year-old child about ${(m.heightCm / 100).toFixed(2)} m tall, with real child proportions (big head, short legs), not a small adult.` : `About ${(m.heightCm / 100).toFixed(2)} m tall.`,
    "The costume or outfit must leave the face and hair fully visible: no masks, no face paint.",
    "Nobody else in the image, no props, no furniture, no text, no logos, no watermark.",
  ]
    .filter(Boolean)
    .join("\n");
}

type W6 = [string, string][];
const M = (id: string, name: string, role: MemberRole, age: number, heightCm: number, look: [string, string], wear: [string, string], holiday: W6): FamilyMember => ({
  id,
  name,
  role,
  age,
  heightCm,
  look: { zh: look[0], en: look[1] },
  wear: { zh: wear[0], en: wear[1] },
  themeWear: Object.fromEntries(WEAR_THEMES.map((t, k) => [t.id, { zh: holiday[k][0], en: holiday[k][1] }])),
});

/** 预置 4 家（之前和用户定的）；节日衣服每人一套（同色系，不撞款），顺序 = WEAR_THEMES */
export const PRESET_FAMILIES: FamilyData[] = [
  {
    name: "Miller 家",
    about: { zh: "白人，郊区独栋", en: "a white American family in a suburban single-family house" },
    members: [
      M("ryan", "Ryan", "dad", 34, 183, ["短棕发，短胡子", "short brown hair and a short beard"], ["灰色卫衣、牛仔裤", "a gray hoodie and jeans"], [
        ["红绿格子法兰绒衬衫、深色牛仔裤", "a red-and-green plaid flannel shirt and dark jeans"],
        ["红色圆领毛衣、卡其裤", "a red crewneck sweater and khaki chinos"],
        ["黑色 T 恤外搭橙色格子衬衫、牛仔裤", "an orange plaid flannel shirt open over a black tee, and jeans"],
        ["棕色针织开衫配白 T、卡其裤", "a brown knit cardigan over a white tee, and khaki pants"],
        ["浅蓝色牛津衬衫、深色休闲裤", "a light blue oxford shirt and dark chinos"],
        ["浅薄荷绿 Polo 衫、米色休闲裤", "a pale mint polo shirt and beige chinos"],
      ]),
      M("emily", "Emily", "mom", 32, 166, ["金色齐肩发", "shoulder-length blonde hair"], ["米色毛衣、浅色牛仔裤", "a beige knit sweater and light jeans"], [
        ["酒红色高领毛衣、深色牛仔裤", "a burgundy turtleneck sweater and dark jeans"],
        ["红色针织开衫配白色上衣、浅色牛仔裤", "a red knit cardigan over a white top, and light jeans"],
        ["橙色毛衣、黑色打底裤、黑色猫耳发箍", "an orange sweater, black leggings and a black cat-ear headband"],
        ["芥末黄毛衣、棕色灯芯绒裤", "a mustard yellow sweater and brown corduroy pants"],
        ["淡粉色碎花连衣裙", "a light pink floral dress"],
        ["淡黄色针织开衫、白色牛仔裤", "a pale yellow cardigan and white jeans"],
      ]),
      M("leo", "Leo", "son", 3, 95, ["浅棕卷发", "light brown curly hair"], ["蓝色长袖 T 恤、卡其裤", "a blue long-sleeve tee and khaki pants"], [
        ["红色驯鹿图案毛衣、藏青色裤子", "a red sweater with a reindeer pattern and navy pants"],
        ["红色中式小棉袄（盘扣）、黑色裤子", "a little red Chinese padded jacket with knot buttons and black pants"],
        ["绿色恐龙连帽卫衣（帽子上有软刺）、绿色裤子", "a green dinosaur hoodie with soft spikes on the hood (hood down) and green pants"],
        ["橙色长袖 T 恤、棕色灯芯绒裤", "an orange long-sleeve tee and brown corduroy pants"],
        ["蓝色 T 恤、牛仔裤、纸做的派对帽", "a blue tee, jeans and a paper party hat"],
        ["浅蓝色背带裤配白色 T 恤", "light blue overalls over a white tee"],
      ]),
    ],
  },
  {
    name: "Johnson 家",
    about: { zh: "非裔，联排别墅", en: "a Black American family in a townhouse" },
    members: [
      M("marcus", "Marcus", "dad", 35, 185, ["寸头，络腮短胡", "a close-cropped haircut and a short full beard"], ["藏青色毛衣", "a navy crewneck sweater"], [
        ["墨绿色白雪花圣诞毛衣、深色牛仔裤", "a dark green Christmas sweater with a white snowflake pattern and dark jeans"],
        ["红色亨利衫、黑色休闲裤", "a red henley shirt and black chinos"],
        ["黑色连帽卫衣、牛仔裤", "a black hoodie and jeans"],
        ["棕色格子衬衫、深色牛仔裤", "a brown plaid button-down shirt and dark jeans"],
        ["白色亚麻衬衫、卡其裤", "a white linen shirt and khaki pants"],
        ["淡蓝色衬衫、白色休闲裤", "a light blue button-down shirt and white chinos"],
      ]),
      M("maya", "Maya", "mom", 31, 168, ["自然卷发扎高马尾", "natural curly hair in a high ponytail"], ["白色针织开衫", "a white knit cardigan"], [
        ["红色 V 领毛衣、黑色裤子", "a red V-neck sweater and black pants"],
        ["金色缎面上衣、黑色阔腿裤", "a gold satin blouse and black wide-leg pants"],
        ["黑色长袖连衣裙、紫色小女巫帽", "a black long-sleeve dress and a small purple witch hat"],
        ["铁锈橙针织毛衣、深色牛仔裤", "a rust orange knit sweater and dark jeans"],
        ["明黄色裹身连衣裙", "a sunny yellow wrap dress"],
        ["薰衣草紫中长连衣裙", "a lavender midi dress"],
      ]),
      M("zoe", "Zoe", "daughter", 2.5, 90, ["两个小发髻", "two small afro puffs"], ["粉色卫衣、打底裤", "a pink sweatshirt and leggings"], [
        ["红色丝绒连衣裙、白色打底袜", "a red velvet dress and white tights"],
        ["粉色中式小棉袄（盘扣）、打底裤", "a pink Chinese-style padded top with knot buttons and leggings"],
        ["黄黑条纹小蜜蜂连体服（小翅膀）", "a yellow-and-black striped bumblebee costume with small wings"],
        ["芥末黄毛衣、棕色打底裤", "a mustard yellow sweater and brown leggings"],
        ["粉色纱裙、小皇冠发夹", "a pink tutu dress and a small tiara clip"],
        ["白色连衣裙、兔耳发箍", "a white dress and a bunny-ear headband"],
      ]),
    ],
  },
  {
    name: "Rivera 家",
    about: { zh: "拉丁裔，双亲加两个孩子", en: "a Latino American family with two kids" },
    members: [
      M("carlos", "Carlos", "dad", 36, 178, ["黑色短发", "short black hair"], ["格子衬衫", "a flannel shirt"], [
        ["红色麻花针织毛衣、牛仔裤", "a red cable-knit sweater and jeans"],
        ["暗红色衬衫、黑色牛仔裤", "a dark red button-down shirt and black jeans"],
        ["橙黑格子法兰绒衬衫、牛仔裤", "an orange-and-black flannel shirt and jeans"],
        ["橄榄绿毛衣、卡其裤", "an olive green sweater and khaki pants"],
        ["白色 Polo 衫、牛仔裤", "a white polo shirt and jeans"],
        ["淡粉色衬衫、卡其裤", "a pale pink button-down shirt and khaki chinos"],
      ]),
      M("sofia", "Sofia", "mom", 33, 163, ["深棕长卷发", "long dark brown wavy hair"], ["酒红色毛衣", "a burgundy sweater"], [
        ["墨绿色丝绒上衣、黑色裤子", "a dark green velvet top and black pants"],
        ["红色针织毛衣连衣裙", "a red knit sweater dress"],
        ["黑色毛衣、橙色围巾、牛仔裤", "a black sweater, an orange scarf and jeans"],
        ["驼色毛衣、深色牛仔裤", "a camel sweater and dark jeans"],
        ["珊瑚色连衣裙", "a coral sundress"],
        ["淡蓝色碎花连衣裙", "a light blue floral dress"],
      ]),
      M("lucia", "Lucia", "daughter", 5, 110, ["深棕长发扎马尾", "long dark brown hair in a ponytail"], ["黄色卫衣、牛仔裤", "a yellow sweatshirt and jeans"], [
        ["红格子连衣裙、白色打底袜", "a red tartan dress and white tights"],
        ["红色中式小棉袄、黑色打底裤", "a red Chinese padded jacket and black leggings"],
        ["粉色仙女裙、小亮片翅膀", "a pink fairy dress with small sparkly wings"],
        ["橙色毛衣、牛仔裤", "an orange sweater and jeans"],
        ["紫色亮片派对裙、纸做的派对帽", "a purple sequin party dress and a paper party hat"],
        ["淡黄色连衣裙配白色开衫", "a pale yellow dress with a white cardigan"],
      ]),
      M("mateo", "Mateo", "son", 2, 88, ["黑色短卷发", "short black curly hair"], ["绿色长袖 T 恤", "a green long-sleeve tee"], [
        ["绿色小精灵连帽衫、红色裤子", "a green elf hoodie and red pants"],
        ["红色中式小马甲配白色长袖、黑色裤子", "a little red Chinese vest over a white long-sleeve tee, and black pants"],
        ["橙色南瓜连体服", "an orange pumpkin costume"],
        ["棕色毛衣、卡其裤", "a brown sweater and khaki pants"],
        ["藏青色背带裤、纸做的派对帽", "navy overalls and a paper party hat"],
        ["浅绿色 Polo 衫、卡其裤", "a light green polo shirt and khaki pants"],
      ]),
    ],
  },
  {
    name: "Bennett 家",
    about: { zh: "白人爸爸 + 日裔妈妈的混血家庭，外婆 Keiko 可选出镜", en: "a mixed white and Japanese American family" },
    members: [
      M("daniel", "Daniel", "dad", 37, 180, ["白人，深金色短发", "a white man with short dark blonde hair"], ["橄榄绿夹克", "an olive green jacket"], [
        ["藏青色费尔岛毛衣、牛仔裤", "a navy Fair Isle sweater and jeans"],
        ["酒红色半拉链毛衣、灰色裤子", "a burgundy quarter-zip sweater and gray pants"],
        ["黑色 T 恤外搭橙色格子衬衫、深色牛仔裤", "an orange plaid shirt open over a black tee, and dark jeans"],
        ["燕麦色针织毛衣、棕色休闲裤", "an oatmeal knit sweater and brown chinos"],
        ["浅灰 T 恤外搭牛仔夹克", "a light gray tee under a denim jacket, and dark jeans"],
        ["淡黄色衬衫、卡其裤", "a pale yellow button-down shirt and khaki pants"],
      ]),
      M("aiko", "Aiko", "mom", 35, 162, ["日裔，黑色直长发", "a Japanese American woman with long straight black hair"], ["奶白色高领毛衣", "a cream turtleneck sweater"], [
        ["奶白色毛衣配红色围巾", "a cream sweater with a red scarf, and dark jeans"],
        ["红色立领中式上衣、黑色裤子", "a red mandarin-collar blouse and black pants"],
        ["黑色高领毛衣、橙色半身裙", "a black turtleneck and an orange A-line skirt"],
        ["墨绿色开衫、浅色牛仔裤", "a forest green cardigan and light jeans"],
        ["薄荷绿连衣裙", "a mint green dress"],
        ["淡粉色针织开衫、白色半身裙", "a pale pink cardigan and a white skirt"],
      ]),
      M("kai", "Kai", "son", 4, 102, ["亚白混血，深棕直发", "a mixed Asian-white boy with straight dark brown hair"], ["橙色卫衣", "an orange hoodie"], [
        ["绿色白驯鹿圣诞毛衣、牛仔裤", "a green Christmas sweater with a white reindeer and jeans"],
        ["红色唐装小外套、黑色裤子", "a little red Tang-style jacket and black pants"],
        ["红色消防员套装（不戴头盔）", "a red firefighter costume jacket and pants, no helmet"],
        ["棕色格子衬衫、卡其裤", "a brown plaid shirt and khaki pants"],
        ["绿色恐龙图案 T 恤、牛仔裤、纸做的派对帽", "a green dinosaur-print tee, jeans and a paper party hat"],
        ["浅蓝衬衫、灰色背带裤", "a light blue shirt and gray pants with suspenders"],
      ]),
      M("keiko", "Keiko", "grandma", 63, 155, ["日裔，银色短发", "a Japanese American grandmother with short silver hair"], ["灰色开衫", "a gray cardigan"], [
        ["红色开衫、珍珠项链", "a red cardigan and a pearl necklace"],
        ["暗红色绣花外套、黑色裤子", "a dark red embroidered jacket and black pants"],
        ["紫色开衫、黑色裤子", "a purple cardigan and black pants"],
        ["驼色羊毛开衫、灰色裤子", "a camel wool cardigan and gray pants"],
        ["淡紫色上衣、白色裤子", "a lilac blouse and white pants"],
        ["浅粉色开衫、白色裤子", "a light pink cardigan and white pants"],
      ]),
    ],
  },
];

/** 预置成员（按 id）：老数据迁移时补每人的节日衣服 */
export const presetMember = (id: string) => PRESET_FAMILIES.flatMap((f) => f.members).find((m) => m.id === id);

/** 这一镜谁拿手机：镜头自己设的优先；"none" = 不指定 */
export function filmerId(v: { filmer?: string }, s: { filmer?: string }): string | undefined {
  const id = s.filmer ?? v.filmer;
  return id && id !== "none" ? id : undefined;
}

/** 拿手机的高度按拍摄者身高缩放（预设按 1.75 米的大人） */
export const filmerScale = (heightCm?: number) => (heightCm ? Math.min(1.2, Math.max(0.5, heightCm / 175)) : 1);
