// 家庭库（所有产品共用）：每家几个成员，每人有身高、长相、平时衣服；整家按节日穿同款。纯函数，服务端和客户端共用。
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

/** 中文给人看，英文进提示词 */
export interface Bi {
  zh: string;
  en: string;
}
export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  age: number;
  heightCm: number;
  look: Bi;
  wear: Bi;
  /** 定妆照（以后出，逐张审批）；空 = 只用文字描述 */
  portrait?: string;
}
export interface FamilyData {
  name: string;
  /** 一句话：族裔、住什么样的房子 */
  about: Bi;
  members: FamilyMember[];
  /** 按节日（THEMES id）整家穿的衣服；没写的节日穿平时衣服 */
  themeWear: Record<string, Bi>;
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
}

export const memberKind = (m: Pick<FamilyMember, "role" | "age">): FigureKind => (m.age >= 14 ? "adult" : "child");

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const bi = (v: unknown, n = 300): Bi => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { zh: str(o.zh, n), en: str(o.en, n) };
};
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function cleanFamily(v: unknown): FamilyData | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const name = str(o.name, 40);
  if (!name) return null;
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
        ...(typeof x.portrait === "string" && x.portrait ? { portrait: x.portrait.slice(0, 200) } : {}),
      },
    ];
  });
  const tw = (o.themeWear && typeof o.themeWear === "object" ? o.themeWear : {}) as Record<string, unknown>;
  const themeWear: Record<string, Bi> = {};
  for (const [k, w] of Object.entries(tw).slice(0, 20)) {
    const b = bi(w);
    if (/^[a-z-]{1,20}$/.test(k) && (b.zh || b.en)) themeWear[k] = b;
  }
  return { name, about: bi(o.about), members, themeWear };
}

/** 进提示词的一句话：“Leo, a 3-year-old boy, light brown curly hair, wearing …” */
export function memberText(f: Pick<FamilyData, "themeWear">, m: FamilyMember, theme: string): string {
  const age = m.age < 1 ? "baby" : m.age < 14 ? `${Math.round(m.age * 2) / 2}-year-old ${m.role === "daughter" ? "girl" : m.role === "son" ? "boy" : "child"}` : `${Math.round(m.age)}-year-old ${m.role === "mom" || m.role === "grandma" ? "woman" : m.role === "dad" || m.role === "grandpa" ? "man" : "adult"}`;
  const wear = f.themeWear[theme]?.en || m.wear.en;
  return [`${m.name}, a ${age}`, m.look.en, wear ? `wearing ${wear}` : ""].filter(Boolean).join(", ");
}

const M = (id: string, name: string, role: MemberRole, age: number, heightCm: number, look: [string, string], wear: [string, string]): FamilyMember => ({
  id,
  name,
  role,
  age,
  heightCm,
  look: { zh: look[0], en: look[1] },
  wear: { zh: wear[0], en: wear[1] },
});
const XMAS = (zh: string, en: string) => ({ christmas: { zh, en } });

/** 预置 4 家（之前和用户定的）；第一次打开家庭库时写进去，之后可以改 */
export const PRESET_FAMILIES: FamilyData[] = [
  {
    name: "Miller 家",
    about: { zh: "白人，郊区独栋", en: "a white American family in a suburban single-family house" },
    members: [
      M("ryan", "Ryan", "dad", 34, 183, ["短棕发，短胡子", "short brown hair and a short beard"], ["灰色卫衣、牛仔裤", "a gray hoodie and jeans"]),
      M("emily", "Emily", "mom", 32, 166, ["金色齐肩发", "shoulder-length blonde hair"], ["米色毛衣、浅色牛仔裤", "a beige knit sweater and light jeans"]),
      M("leo", "Leo", "son", 3, 95, ["浅棕卷发", "light brown curly hair"], ["蓝色长袖 T 恤、卡其裤", "a blue long-sleeve tee and khaki pants"]),
    ],
    themeWear: XMAS("全家红格子圣诞睡衣", "matching red plaid Christmas pajamas"),
  },
  {
    name: "Johnson 家",
    about: { zh: "非裔，联排别墅", en: "a Black American family in a townhouse" },
    members: [
      M("marcus", "Marcus", "dad", 35, 185, ["寸头，络腮短胡", "a close-cropped haircut and a short full beard"], ["藏青色毛衣", "a navy crewneck sweater"]),
      M("maya", "Maya", "mom", 31, 168, ["自然卷发扎高马尾", "natural curly hair in a high ponytail"], ["白色针织开衫", "a white knit cardigan"]),
      M("zoe", "Zoe", "daughter", 2.5, 90, ["两个小发髻", "two small afro puffs"], ["粉色卫衣、打底裤", "a pink sweatshirt and leggings"]),
    ],
    themeWear: XMAS("全家同款绿色圣诞毛衣", "matching green Christmas sweaters"),
  },
  {
    name: "Rivera 家",
    about: { zh: "拉丁裔，双亲加两个孩子", en: "a Latino American family with two kids" },
    members: [
      M("carlos", "Carlos", "dad", 36, 178, ["黑色短发", "short black hair"], ["格子衬衫", "a flannel shirt"]),
      M("sofia", "Sofia", "mom", 33, 163, ["深棕长卷发", "long dark brown wavy hair"], ["酒红色毛衣", "a burgundy sweater"]),
      M("lucia", "Lucia", "daughter", 5, 110, ["深棕长发扎马尾", "long dark brown hair in a ponytail"], ["黄色卫衣、牛仔裤", "a yellow sweatshirt and jeans"]),
      M("mateo", "Mateo", "son", 2, 88, ["黑色短卷发", "short black curly hair"], ["绿色长袖 T 恤", "a green long-sleeve tee"]),
    ],
    themeWear: XMAS("全家红白条纹圣诞睡衣", "matching red-and-white striped Christmas pajamas"),
  },
  {
    name: "Bennett 家",
    about: { zh: "白人爸爸 + 日裔妈妈的混血家庭，外婆 Keiko 可选出镜", en: "a mixed white and Japanese American family" },
    members: [
      M("daniel", "Daniel", "dad", 37, 180, ["白人，深金色短发", "a white man with short dark blonde hair"], ["橄榄绿夹克", "an olive green jacket"]),
      M("aiko", "Aiko", "mom", 35, 162, ["日裔，黑色直长发", "a Japanese American woman with long straight black hair"], ["奶白色高领毛衣", "a cream turtleneck sweater"]),
      M("kai", "Kai", "son", 4, 102, ["亚白混血，深棕直发", "a mixed Asian-white boy with straight dark brown hair"], ["橙色卫衣", "an orange hoodie"]),
      M("keiko", "Keiko", "grandma", 63, 155, ["日裔，银色短发", "a Japanese American grandmother with short silver hair"], ["灰色开衫", "a gray cardigan"]),
    ],
    themeWear: XMAS("全家藏青色雪花圣诞睡衣", "matching navy snowflake Christmas pajamas"),
  },
];

/** 这一镜谁拿手机：镜头自己设的优先；"none" = 不指定 */
export function filmerId(v: { filmer?: string }, s: { filmer?: string }): string | undefined {
  const id = s.filmer ?? v.filmer;
  return id && id !== "none" ? id : undefined;
}

/** 拿手机的高度按拍摄者身高缩放（预设按 1.75 米的大人） */
export const filmerScale = (heightCm?: number) => (heightCm ? Math.min(1.2, Math.max(0.5, heightCm / 175)) : 1);
