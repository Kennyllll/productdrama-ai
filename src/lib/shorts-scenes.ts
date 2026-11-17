// 短视频场地库：场地（房间结构）+ 版本 + 节日主题层（纯函数，客户端和服务端共用）。
// 物件带类别和真实尺寸，网页 3D 地图按类别画家具形状；以后 Blender 可按同一份数据建场景出深度图 / 线稿。
// 坐标沿用 Blender：x 东、y 北、z 上，单位米；产品默认放在原点。
import type { SetProp } from "@/lib/production-repo";

type V3 = [number, number, number];

export interface ItemType {
  id: string;
  label: string;
  /** 默认尺寸：宽（x）、深（y）、高（z），米 */
  size: V3;
  rgb: V3;
  /** 英文名，写进提示词 */
  en: string;
  /** 默认离地高度（窗户、挂画） */
  z?: number;
  outdoor?: boolean;
}

export const ITEM_TYPES: ItemType[] = [
  { id: "wall", label: "墙", size: [4, 0.1, 2.6], rgb: [0.86, 0.84, 0.8], en: "wall" },
  { id: "floor", label: "地面 / 地板", size: [6, 6, 0.01], rgb: [0.62, 0.5, 0.38], en: "floor" },
  { id: "rug", label: "地毯", size: [2.4, 1.7, 0.01], rgb: [0.78, 0.76, 0.72], en: "area rug" },
  { id: "sofa", label: "沙发", size: [2.2, 0.9, 0.85], rgb: [0.45, 0.47, 0.5], en: "sofa" },
  { id: "armchair", label: "单人沙发", size: [0.9, 0.85, 0.85], rgb: [0.5, 0.45, 0.4], en: "armchair" },
  { id: "coffee_table", label: "茶几", size: [1.1, 0.6, 0.42], rgb: [0.5, 0.36, 0.24], en: "coffee table" },
  { id: "table", label: "餐桌", size: [1.6, 0.9, 0.75], rgb: [0.55, 0.4, 0.27], en: "dining table" },
  { id: "chair", label: "椅子", size: [0.45, 0.5, 0.9], rgb: [0.55, 0.4, 0.27], en: "chair" },
  { id: "tv_stand", label: "电视柜 + 电视", size: [1.6, 0.45, 1.2], rgb: [0.3, 0.3, 0.32], en: "TV on a low TV stand" },
  { id: "shelf", label: "书架 / 置物架", size: [1, 0.35, 1.8], rgb: [0.6, 0.45, 0.3], en: "bookshelf" },
  { id: "cabinet", label: "矮柜", size: [1.2, 0.45, 0.8], rgb: [0.85, 0.85, 0.85], en: "low cabinet" },
  { id: "bed", label: "床", size: [1.2, 2, 0.55], rgb: [0.85, 0.85, 0.9], en: "bed" },
  { id: "window", label: "窗户", size: [1.4, 0.08, 1.3], rgb: [0.75, 0.85, 0.95], en: "window", z: 0.8 },
  { id: "door", label: "门", size: [0.9, 0.08, 2.1], rgb: [0.95, 0.95, 0.93], en: "door" },
  { id: "stairs", label: "楼梯", size: [1, 2.6, 2.6], rgb: [0.6, 0.48, 0.35], en: "staircase" },
  { id: "lamp", label: "落地灯", size: [0.4, 0.4, 1.6], rgb: [0.9, 0.85, 0.7], en: "floor lamp" },
  { id: "plant", label: "盆栽", size: [0.5, 0.5, 1.1], rgb: [0.25, 0.5, 0.25], en: "potted plant" },
  { id: "toy", label: "玩具", size: [0.35, 0.3, 0.3], rgb: [0.3, 0.6, 0.3], en: "kids' toys" },
  { id: "kitchen", label: "厨房台面", size: [2.4, 0.65, 0.92], rgb: [0.9, 0.9, 0.88], en: "kitchen counter" },
  { id: "fireplace", label: "壁炉", size: [1.5, 0.45, 1.1], rgb: [0.7, 0.62, 0.55], en: "fireplace" },
  { id: "house", label: "房子外墙", size: [8, 6, 3.2], rgb: [0.75, 0.68, 0.6], en: "house facade", outdoor: true },
  { id: "garage_door", label: "车库门", size: [2.6, 0.1, 2.2], rgb: [0.92, 0.92, 0.9], en: "garage door", outdoor: true },
  { id: "path", label: "路面 / 车道", size: [3, 8, 0.01], rgb: [0.62, 0.62, 0.6], en: "paved driveway / path", outdoor: true },
  { id: "lawn", label: "草坪", size: [6, 8, 0.02], rgb: [0.36, 0.52, 0.26], en: "lawn", outdoor: true },
  { id: "tree", label: "树", size: [1.5, 1.5, 4], rgb: [0.2, 0.42, 0.2], en: "tree", outdoor: true },
  { id: "bush", label: "灌木", size: [1, 1, 0.8], rgb: [0.25, 0.45, 0.22], en: "bush", outdoor: true },
  { id: "bench", label: "长椅", size: [1.4, 0.5, 0.45], rgb: [0.5, 0.36, 0.24], en: "bench", outdoor: true },
  { id: "fence", label: "栅栏", size: [4, 0.08, 1], rgb: [0.95, 0.95, 0.93], en: "fence", outdoor: true },
  { id: "car", label: "汽车", size: [1.8, 4.5, 1.5], rgb: [0.3, 0.32, 0.36], en: "parked car", outdoor: true },
  // 节日装饰
  { id: "xmas_tree", label: "圣诞树", size: [0.9, 0.9, 2.1], rgb: [0.16, 0.4, 0.2], en: "decorated Christmas tree" },
  { id: "gift", label: "礼物（已包好）", size: [0.35, 0.35, 0.3], rgb: [0.75, 0.15, 0.15], en: "wrapped gifts" },
  { id: "stocking", label: "圣诞袜", size: [0.2, 0.05, 0.4], rgb: [0.8, 0.1, 0.1], en: "Christmas stockings", z: 0.9 },
  { id: "lantern", label: "灯笼", size: [0.4, 0.4, 0.5], rgb: [0.85, 0.1, 0.1], en: "red paper lanterns", z: 1.7 },
  { id: "couplet", label: "春联 / 福字", size: [0.5, 0.03, 1.2], rgb: [0.85, 0.1, 0.1], en: "red spring couplets and fu character", z: 0.7 },
  { id: "pumpkin", label: "南瓜灯", size: [0.4, 0.4, 0.35], rgb: [0.95, 0.5, 0.1], en: "carved pumpkins", z: 0 },
  { id: "garland", label: "彩带 / 挂饰", size: [2, 0.05, 0.3], rgb: [0.9, 0.7, 0.2], en: "garland", z: 2 },
  { id: "balloon", label: "气球", size: [0.35, 0.35, 0.45], rgb: [0.9, 0.4, 0.6], en: "balloons", z: 1.2 },
  { id: "cake", label: "蛋糕", size: [0.3, 0.3, 0.2], rgb: [0.95, 0.9, 0.85], en: "birthday cake", z: 0.75 },
  { id: "egg", label: "彩蛋篮", size: [0.35, 0.3, 0.25], rgb: [0.6, 0.8, 0.95], en: "Easter egg basket" },
  { id: "box", label: "灰盒（旧版）", size: [1, 1, 1], rgb: [0.6, 0.6, 0.6], en: "furniture" },
];

export const findItemType = (id: string) => ITEM_TYPES.find((t) => t.id === id) ?? ITEM_TYPES[ITEM_TYPES.length - 1];

export interface SceneItem {
  id: string;
  type: string;
  /** 中心点（地面投影） */
  x: number;
  y: number;
  /** 底部离地高度 */
  z: number;
  /** 绕竖轴旋转，度；0 = 宽度沿 x（东西） */
  yaw: number;
  w: number;
  d: number;
  h: number;
  rgb: V3;
  /** 有值 = 属于这个主题的装饰层，只在镜头选了这个主题时出现 */
  theme?: string;
  note?: string;
}

export interface SceneVersion {
  v: number;
  items: SceneItem[];
  /** 空场景参考图（gen_jobs id），$0.10，用户每次单独批准 */
  refJobId: string | null;
  /** 参考图是哪个版本生成的（改了结构后会提示参考图可能过时） */
  refFromV?: number;
  note: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** 场地级特殊要求：写进每一镜的首帧 / 视频提示词 */
  special: string;
  outdoor: boolean;
  versions: SceneVersion[];
  updatedAt: string;
}

/** 镜头绑定的场地：确认构图后锁定版本 */
export interface ShotScene {
  id: string;
  v: number;
  theme: string;
  /** 自定义主题的描述（theme = "custom"） */
  themeText?: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  /** 场合（写进提示词）；具体装饰只按 3D 里摆的写 */
  mood: string;
  /** 按室内 / 室外补的节日点缀（合理、放背景，不挡产品和人） */
  indoor: string;
  outdoor: string;
  prompt: string;
}

export const THEMES: ThemePreset[] = [
  { id: "none", label: "无节日", mood: "", indoor: "", outdoor: "", prompt: "" },
  { id: "christmas", label: "圣诞", mood: "Christmas morning", indoor: "a decorated Christmas tree with warm string lights in the background, a few wrapped gifts near the tree, stockings on the mantel or wall", outdoor: "a green wreath on the front door or garage door, warm string lights along the roofline or porch, a red bow on a post or mailbox", prompt: "Christmas morning: a decorated Christmas tree with warm string lights, wrapped gifts under the tree, stockings" },
  { id: "cny", label: "春节", mood: "Chinese New Year", indoor: "red paper lanterns, red spring couplets and a fu character on the door, a plate of tangerines", outdoor: "red spring couplets and an upside-down fu character on the front door, a pair of red lanterns by the entrance", prompt: "Chinese New Year: red paper lanterns, red spring couplets and fu characters, tangerines on the table" },
  { id: "halloween", label: "万圣节", mood: "Halloween", indoor: "a carved jack-o'-lantern on a shelf, a little fake cobweb, orange-and-black garland", outdoor: "carved jack-o'-lanterns on the porch steps, fake cobwebs on the bushes, orange string lights", prompt: "Halloween: carved jack-o'-lanterns, fake cobwebs and orange-and-black garland" },
  { id: "thanksgiving", label: "感恩节", mood: "Thanksgiving", indoor: "small pumpkins and gourds, a harvest garland, warm afternoon light", outdoor: "a harvest wreath on the door, pumpkins and potted mums by the entrance, fallen autumn leaves on the lawn", prompt: "Thanksgiving: autumn leaves, small pumpkins and a harvest garland, warm afternoon light" },
  { id: "birthday", label: "生日", mood: "a kid's birthday party", indoor: "balloons, a happy-birthday banner, a birthday cake on the table", outdoor: "a bunch of balloons tied to the porch rail or mailbox, a happy-birthday yard sign", prompt: "kid's birthday party: balloons, a happy-birthday banner, a birthday cake on the table" },
  { id: "easter", label: "复活节", mood: "Easter morning", indoor: "pastel decorations, an Easter egg basket and colorful eggs", outdoor: "colorful plastic eggs in the grass, a pastel wreath on the front door", prompt: "Easter morning: pastel decorations, an Easter egg basket and colorful eggs" },
  { id: "custom", label: "自定义", mood: "", indoor: "", outdoor: "", prompt: "" },
];

export const findTheme = (id: string | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];

let seq = 0;
export const itemId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newItem(type: string, x = 0, y = 1.5, theme?: string): SceneItem {
  const t = findItemType(type);
  return { id: itemId(), type: t.id, x, y, z: t.z ?? 0, yaw: 0, w: t.size[0], d: t.size[1], h: t.size[2], rgb: [...t.rgb] as V3, ...(theme ? { theme } : {}) };
}

/** 旧版灰盒 SetProp → 物件（类别 box） */
export function boxItem(p: SetProp, type = "box", theme?: string): SceneItem {
  return {
    id: itemId(),
    type,
    x: Math.round(((p.lo[0] + p.hi[0]) / 2) * 100) / 100,
    y: Math.round(((p.lo[1] + p.hi[1]) / 2) * 100) / 100,
    z: p.lo[2],
    yaw: 0,
    w: Math.abs(p.hi[0] - p.lo[0]),
    d: Math.abs(p.hi[1] - p.lo[1]),
    h: Math.abs(p.hi[2] - p.lo[2]),
    rgb: p.rgb,
    ...(theme ? { theme } : {}),
  };
}

/** 本镜可见的物件：基础层 + 所选主题的装饰层 */
export const activeItems = (items: SceneItem[], theme: string) => items.filter((i) => !i.theme || i.theme === theme);

/** 物件 → 轴对齐方块（旧的长剧地图 / Blender 灰盒兜底用） */
export function itemsToProps(items: SceneItem[]): SetProp[] {
  return items.map((i) => {
    const r = (i.yaw * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(r)) * i.w + Math.abs(Math.sin(r)) * i.d) / 2;
    const hd = (Math.abs(Math.sin(r)) * i.w + Math.abs(Math.cos(r)) * i.d) / 2;
    return { lo: [i.x - hw, i.y - hd, i.z], hi: [i.x + hw, i.y + hd, i.z + i.h], rgb: i.rgb };
  });
}

const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** 校验物件：尺寸 / 边界钳制，未知类别回退为灰盒；最多 120 件 */
export function cleanItems(list: unknown): SceneItem[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 120).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const x = raw as Partial<SceneItem>;
    const t = findItemType(String(x.type ?? "box"));
    const rgb = Array.isArray(x.rgb) && x.rgb.length === 3 ? (x.rgb.map((c) => n(c, 0, 1, 0.6)) as V3) : ([...t.rgb] as V3);
    return [
      {
        id: typeof x.id === "string" && x.id.length <= 40 ? x.id : itemId(),
        type: t.id,
        x: n(x.x, -60, 60, 0),
        y: n(x.y, -60, 60, 0),
        z: n(x.z, 0, 10, t.z ?? 0),
        yaw: n(x.yaw, -360, 360, 0),
        w: n(x.w, 0.02, 40, t.size[0]),
        d: n(x.d, 0.01, 40, t.size[1]),
        h: n(x.h, 0.005, 20, t.size[2]),
        rgb,
        ...(typeof x.theme === "string" && x.theme && x.theme !== "none" ? { theme: x.theme.slice(0, 40) } : {}),
        ...(typeof x.note === "string" && x.note ? { note: x.note.slice(0, 80) } : {}),
      },
    ];
  });
}

/** 房间范围（墙 / 地面的外框），没有就按物件 */
export function sceneBounds(items: SceneItem[]): { x0: number; x1: number; y0: number; y1: number } {
  const base = items.filter((i) => !i.theme);
  const ref = base.filter((i) => i.type === "wall" || i.type === "floor");
  const ps = itemsToProps(ref.length ? ref : base);
  if (!ps.length) return { x0: -3, x1: 3, y0: -3, y1: 3 };
  return { x0: Math.min(...ps.map((p) => p.lo[0])), x1: Math.max(...ps.map((p) => p.hi[0])), y0: Math.min(...ps.map((p) => p.lo[1])), y1: Math.max(...ps.map((p) => p.hi[1])) };
}

/** 选了一个还没有装饰层的主题：按房间范围自动摆一套装饰（之后可在地图里改） */
export function themeDecor(theme: string, items: SceneItem[], outdoor: boolean): SceneItem[] {
  const b = sceneBounds(items);
  const bx = b.x1 - 0.7;
  const by = b.y1 - 0.7;
  const at = (type: string, x: number, y: number, z?: number) => ({ ...newItem(type, x, y, theme), ...(z !== undefined ? { z } : {}) });
  switch (theme) {
    case "christmas":
      return outdoor ? [at("tree", bx, by), at("garland", 0, b.y1 - 0.1, 2.4)] : [at("xmas_tree", bx, by), at("gift", bx - 0.6, by - 0.4), at("gift", bx - 0.2, by - 0.7), at("stocking", 0, b.y1 - 0.1, 1)];
    case "cny":
      return [at("lantern", b.x0 + 0.8, b.y1 - 0.3, 1.9), at("lantern", b.x1 - 0.8, b.y1 - 0.3, 1.9), at("couplet", 0, b.y1 - 0.08, 0.8)];
    case "halloween":
      return [at("pumpkin", bx, by), at("pumpkin", bx - 0.5, by), at("garland", 0, b.y1 - 0.1, 2)];
    case "thanksgiving":
      return [at("pumpkin", bx, by), at("garland", 0, b.y1 - 0.1, 2), at("plant", b.x0 + 0.6, by)];
    case "birthday":
      return [at("balloon", bx, by, 1.2), at("balloon", bx - 0.4, by, 1.4), at("garland", 0, b.y1 - 0.1, 2), at("cake", b.x0 + 1, by, 0.75)];
    case "easter":
      return [at("egg", bx, by), at("garland", 0, b.y1 - 0.1, 2)];
    default:
      return [];
  }
}

/** 写进首帧提示词的场地描述（英文由调用方保证；中文描述也能被 Sunburst 读懂） */
/** see：按这一镜机位判断物件看不看得到（给了就只写画面里有的，并写明哪些在镜头后面） */
export function sceneText(scene: Scene, ver: SceneVersion, sh: ShotScene, see?: (i: SceneItem) => { nx: number; z: number } | null): string {
  const all = activeItems(ver.items, sh.theme).filter((i) => !["wall", "floor", "box"].includes(i.type));
  const sight = new Map(all.map((i) => [i.id, see ? see(i) : { nx: 0, z: 0 }]));
  const items = all.filter((i) => sight.get(i.id));
  const hidden = all.filter((i) => !sight.get(i.id));
  // 节日层里的普通物件写成节日版本：树挂灯、彩带是节日挂饰
  const FESTIVE: Record<string, string> = { tree: "evergreen tree wrapped in warm string lights", garland: "holiday garland" };
  const nameOf = (i: SceneItem) => (i.theme ? (FESTIVE[i.type] ?? findItemType(i.type).en) : findItemType(i.type).en);
  const where = (i: SceneItem) => {
    const r = sight.get(i.id)!;
    return r.z > 6 ? "far background" : r.nx < -0.33 ? "frame left" : r.nx > 0.33 ? "frame right" : "center";
  };
  const placed = (list: SceneItem[]) => {
    if (!see) return [...new Set(list.map(nameOf))];
    const m = new Map<string, Set<string>>();
    for (const i of list) m.set(nameOf(i), (m.get(nameOf(i)) ?? new Set<string>()).add(where(i)));
    return [...m].map(([k, w]) => `${k} (${[...w].join(", ")})`);
  };
  const names = placed(items.filter((i) => !i.theme));
  const decor = placed(items.filter((i) => i.theme));
  const gone = [...new Set(hidden.map(nameOf))];
  const houseGone = scene.outdoor && hidden.some((i) => i.type === "house") && !items.some((i) => i.type === "house");
  const t = findTheme(sh.theme);
  // 节日装饰只写 3D 里实际摆了的东西，不再套固定的一句（户外不会凭空多出圣诞树和礼物）
  const theme =
    t.id === "custom"
      ? (sh.themeText ?? "").trim()
        ? `Seasonal decoration: ${(sh.themeText ?? "").trim()}.`
        : ""
      : t.mood
        ? [
            `Occasion: ${t.mood}.`,
            decor.length ? `Holiday decorations exactly where the 3D blocking puts them: ${decor.join(", ")}.` : "",
            houseGone
              ? `Add a few natural ${t.mood} touches only far away on the neighbors' houses, small and out of focus (for example: ${t.outdoor}). Nothing in front of or touching the product or the people, and no other holiday props.`
              : `Add natural ${t.mood} touches that fit this ${scene.outdoor ? "outdoor" : "indoor"} spot, modest and in the background like a real family home: ${scene.outdoor ? t.outdoor : t.indoor}. Nothing in front of or touching the product or the people, and no other holiday props.`,
          ]
            .filter(Boolean)
            .join(" ")
        : "";
  return [
    `Location: ${scene.name}${scene.description.trim() ? ` — ${scene.description.trim()}` : ""}.`,
    names.length ? `${see ? "In frame" : "Furniture and set pieces"}, exactly where the 3D blocking puts them: ${names.join(", ")}.` : "",
    gone.length ? `Behind the camera or outside the frame, so NOT in this shot: ${gone.join(", ")}.` : "",
    houseGone
      ? `The camera faces away from this family's house: no house wall, garage door or front door behind the people. Beyond the visible set, continue the same neighborhood naturally${items.some((i) => i.type === "path") ? ": the driveway runs out to a quiet residential street with neighbors' houses and trees across it" : " with neighbors' yards and houses"}, softly out of focus.`
      : "",
    theme || "No holiday decorations.",
    scene.special.trim() ? `Location requirements (must follow): ${scene.special.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 改场地时检查：已锁定镜头（确认构图 / 采用）画面里看得到的物件被挪了、删了或改了 */
export function visibleChanges(
  oldItems: SceneItem[],
  newItems: SceneItem[],
  shots: { label: string; theme: string; cam: V3; look: V3; lens: number }[],
): string[] {
  const out: string[] = [];
  const same = (a: SceneItem, b: SceneItem) => ["x", "y", "z", "yaw", "w", "d", "h"].every((k) => Math.abs((a[k as keyof SceneItem] as number) - (b[k as keyof SceneItem] as number)) < 0.03) && a.rgb.every((c, i) => Math.abs(c - b.rgb[i]) < 0.03);
  const changed = oldItems.filter((o) => {
    const m = newItems.find((x) => x.id === o.id);
    return !m || !same(o, m);
  });
  for (const s of shots) {
    const hf = 2 * Math.atan(18 / s.lens);
    const dir = Math.atan2(s.look[1] - s.cam[1], s.look[0] - s.cam[0]);
    const hits = changed.filter((o) => {
      if (o.theme && o.theme !== s.theme) return false;
      if (o.type === "floor" || o.type === "wall") return false;
      const a = Math.atan2(o.y - s.cam[1], o.x - s.cam[0]);
      const d = Math.abs(((a - dir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return d < hf / 2 + 0.15 && Math.hypot(o.x - s.cam[0], o.y - s.cam[1]) < 9;
    });
    if (hits.length) out.push(`${s.label}：${[...new Set(hits.map((h) => findItemType(h.type).label))].join("、")}`);
  }
  return out;
}

const W: V3 = [0.86, 0.84, 0.8];
const walls = (x0: number, x1: number, y0: number, y1: number) => [
  { ...newItem("wall", (x0 + x1) / 2, y1 + 0.05), w: x1 - x0 + 0.2 },
  { ...newItem("wall", x0 - 0.05, (y0 + y1) / 2), w: y1 - y0, yaw: 90 },
  { ...newItem("wall", x1 + 0.05, (y0 + y1) / 2), w: y1 - y0, yaw: 90 },
  { ...newItem("wall", (x0 + x1) / 2, y0 - 0.05), w: x1 - x0 + 0.2 },
].map((i) => ({ ...i, rgb: [...W] as V3 }));

/** 新项目的起始场地库：有形状的家具（v1） */
export function presetScenes(): { name: string; description: string; outdoor: boolean; items: SceneItem[] }[] {
  const at = (type: string, x: number, y: number, extra: Partial<SceneItem> = {}) => ({ ...newItem(type, x, y), ...extra });
  return [
    {
      name: "客厅",
      description: "lived-in North American family living room, warm lamp light",
      outdoor: false,
      items: [...walls(-3, 3, -3, 3), at("floor", 0, 0), at("rug", 0, 0.2, { w: 4.4, d: 3.5 }), at("sofa", 0, 2.55), at("coffee_table", 0, 1.35), at("cabinet", -2.78, 0, { yaw: 90, w: 2 }), at("window", 0, 3, { w: 1.8 }), at("lamp", -2.3, 2.5), at("toy", 1, -0.8)],
    },
    {
      name: "儿童房",
      description: "bright kid's bedroom with toys on the floor",
      outdoor: false,
      items: [...walls(-3, 3, -3, 3), at("floor", 0, 0), at("rug", 0, 0, { w: 4.4, d: 3, rgb: [0.55, 0.65, 0.75] }), at("bed", -2.3, 2.1, { w: 1.4 }), at("shelf", 2.78, 0, { yaw: 90 }), at("window", 0.5, 3), at("toy", 0.8, -0.6), at("toy", -0.6, -1.2)],
    },
    {
      name: "车道 / 前院",
      description: "suburban front yard and driveway in daylight",
      outdoor: true,
      items: [at("house", 0, 6.6, { w: 12, d: 4.8 }), at("garage_door", 0, 4.15, { w: 4, h: 2.6 }), at("path", 0, -1, { w: 4, d: 10 }), at("lawn", 5, -1, { w: 6, d: 10 }), at("lawn", -5, -1, { w: 6, d: 10 }), at("tree", 4.75, 1.75), at("bush", -3, 3.2)],
    },
    {
      name: "公园小路",
      description: "neighborhood park path on a sunny afternoon",
      outdoor: true,
      items: [at("lawn", 0, 0, { w: 20, d: 24 }), at("path", 0, 0, { w: 2, d: 24, rgb: [0.66, 0.6, 0.5] }), at("tree", 3.25, -1.25), at("tree", -3.75, 3.75), at("bench", -2.3, -2.75)],
    },
  ];
}
