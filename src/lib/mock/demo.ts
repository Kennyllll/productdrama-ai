// 演示用本地模拟数据（TASK-001）。所有内容均为示例，不代表真实产品信息或 AI 生成结果。
import type {
  Character,
  CameraMove,
  Episode,
  EpisodeNumber,
  OptionItem,
  PetEasterEgg,
  Product,
  ProductPresence,
  Project,
  Scene,
  Shot,
  StoryProposal,
} from "@/lib/types";

export const DEMO_PROJECT_ID = "demo";

export const demoProject: Project = {
  id: DEMO_PROJECT_ID,
  name: "小小探险家（示例项目）",
  brand: "KRIDDO（示例品牌信息）",
  updatedAt: "示例数据",
  episodeCount: 4,
  secondsPerEpisode: 45,
  currentStep: "casting",
  stepStatus: {
    product: "done",
    creative: "done",
    casting: "in_progress",
    script: "todo",
    storyboard: "todo",
    video: "todo",
  },
};

export const demoProduct: Product = {
  name: "儿童滑板车（示例产品）",
  category: "儿童出行 / 滑板车",
  sellingPoints: ["示例卖点：可调节把手高度", "示例卖点：发光轮", "示例卖点：低重心更稳"],
  imageSlots: [
    { id: "front", angle: "正面", required: true },
    { id: "left", angle: "左侧面", required: false },
    { id: "right", angle: "右侧面", required: false },
    { id: "back", angle: "背面", required: false },
    { id: "top45", angle: "45° 俯视", required: false },
    { id: "handle", angle: "细节：把手", required: false },
    { id: "wheel", angle: "细节：车轮", required: false },
    { id: "scene", angle: "使用场景", required: false },
  ],
  bible: [
    { key: "color-main", label: "主色", value: "示例：活力橙", needsConfirmation: true },
    { key: "color-sub", label: "辅色", value: "示例：深灰", needsConfirmation: true },
    { key: "geometry", label: "关键几何", value: "示例：三轮结构、T 型把手", needsConfirmation: true },
    { key: "material", label: "材质", value: "示例：铝合金车架 + PU 轮", needsConfirmation: true },
    { key: "logo", label: "Logo 位置", value: "示例：踏板前端", needsConfirmation: true },
    { key: "size", label: "尺寸", value: "需用户提供（照片无法准确推断）", needsConfirmation: true },
    { key: "age", label: "适用年龄", value: "需用户提供", needsConfirmation: true },
  ],
};

export const themeLibrary: OptionItem[] = [
  { id: "adventure", label: "冒险成长", description: "主角在旅程中克服困难" },
  { id: "friendship", label: "友情", description: "伙伴之间的支持与和解" },
  { id: "family", label: "亲子温情", description: "家庭陪伴与情感连接" },
  { id: "fantasy", label: "奇幻", description: "现实中出现魔法或幻想角色" },
  { id: "sports", label: "运动竞技", description: "比赛、挑战与坚持" },
  { id: "festival", label: "节日惊喜", description: "节日氛围与礼物" },
  { id: "nature", label: "自然环保", description: "户外、自然与保护" },
  { id: "mystery", label: "解谜", description: "线索、悬念与揭晓" },
];

export const visualStyles: OptionItem[] = [
  { id: "warm-film", label: "温暖电影感", description: "暖色调、胶片颗粒、浅景深" },
  { id: "blockbuster", label: "好莱坞大片", description: "高对比、大场面、动感运镜" },
  { id: "fresh", label: "日系清新", description: "明亮低饱和、自然光" },
  { id: "animation-3d", label: "3D 动画风", description: "卡通化角色与场景" },
  { id: "stop-motion", label: "定格动画质感", description: "手工模型质感" },
];

export const productRoles: OptionItem[] = [
  { id: "companion", label: "冒险伙伴", description: "全程陪伴主角，推动旅程" },
  { id: "key-prop", label: "关键道具", description: "在关键时刻帮助解决问题" },
  { id: "witness", label: "成长见证", description: "承载情感记忆的符号" },
  { id: "everyday", label: "生活物件", description: "自然出现在日常场景中" },
];

export const storyProposals: StoryProposal[] = [
  {
    id: "p-explorer",
    title: "小小探险家：森林守护者",
    logline: "两个孩子骑着滑板车误入奇幻森林，帮助守护者后学会互相扶持。",
    themeIds: ["adventure", "friendship", "fantasy"],
    visualStyleId: "warm-film",
    productRoleId: "companion",
    episodeArcs: ["出发的清晨", "森林小径", "雨后的比赛", "回家的路"],
  },
  {
    id: "p-champion",
    title: "冠军之路",
    logline: "不敢参加比赛的孩子，在朋友和滑板车的陪伴下完成第一次挑战。",
    themeIds: ["sports", "friendship"],
    visualStyleId: "blockbuster",
    productRoleId: "key-prop",
    episodeArcs: ["报名", "训练", "意外", "冲线"],
  },
  {
    id: "p-weekend",
    title: "和妈妈的周末",
    logline: "忙碌的妈妈与孩子用四个周末重新认识彼此，滑板车见证了他们的变化。",
    themeIds: ["family", "adventure"],
    visualStyleId: "fresh",
    productRoleId: "witness",
    episodeArcs: ["失约", "公园", "海边", "约定"],
  },
];

export const characterKindLabel: Record<Character["kind"], string> = {
  child: "儿童",
  adult: "成人",
  animal: "动物",
  fantasy: "幻想角色",
};

export const characterRoleLabel: Record<Character["role"], string> = {
  lead: "主角",
  supporting: "配角",
  cameo: "临时角色",
  extra: "群演",
};

export const demoCast: Character[] = [
  { id: "xiaohe", name: "小禾", kind: "child", role: "lead", description: "8 岁，好奇勇敢（虚构角色）", episodes: [1, 2, 3, 4], requiresConsent: false },
  { id: "adou", name: "阿豆", kind: "child", role: "lead", description: "8 岁，谨慎爱带地图（虚构角色）", episodes: [1, 2, 3, 4], requiresConsent: false },
  { id: "mom", name: "林妈妈", kind: "adult", role: "supporting", description: "小禾的妈妈，温柔支持（虚构角色）", episodes: [1, 3, 4], requiresConsent: false },
  { id: "pudding", name: "布丁", kind: "animal", role: "supporting", description: "阿豆的柯基犬（虚构角色）", episodes: [1, 2, 4], requiresConsent: false },
  { id: "taitai", name: "苔苔", kind: "fantasy", role: "cameo", description: "森林守护者，苔藓精灵", episodes: [2, 4], requiresConsent: false },
  { id: "crowd", name: "比赛观众", kind: "adult", role: "extra", description: "公园比赛群演", episodes: [3], requiresConsent: false },
];

export const petEasterEgg: PetEasterEgg = {
  name: "用户的猫（待上传参考照）",
  species: "猫",
  rules: [
    "仅使用用户自己的真实猫，作为固定隐藏彩蛋",
    "不是主角、不说话、不主导剧情",
    "每集出现一次，每次可见 1–3 秒",
    "仅安排低风险动作和场景",
    "正式制作前需上传多角度参考照并确认",
  ],
  appearances: [
    { episode: 1, shotId: "e1-s4", seconds: 2, action: "窗台上伸懒腰" },
    { episode: 2, shotId: "e2-s5", seconds: 2, action: "树洞旁探头又缩回" },
    { episode: 3, shotId: "e3-s5", seconds: 1, action: "长椅下舔爪" },
    { episode: 4, shotId: "e4-s5", seconds: 3, action: "蜷在滑板车旁睡着" },
  ],
};

type ShotSeed = [number, CameraMove, string, string[], string, ProductPresence, boolean?];

function buildShots(ep: EpisodeNumber, seeds: ShotSeed[]): Shot[] {
  return seeds.map(([seconds, camera, description, characterIds, dialogue, product, pet], i) => ({
    id: `e${ep}-s${i + 1}`,
    index: i + 1,
    seconds,
    camera,
    description,
    characterIds,
    dialogue,
    product,
    hasPetEasterEgg: pet ?? false,
  }));
}

function line(id: string, characterId: string | null, text: string) {
  return { id, characterId, text };
}

const ep1Scenes: Scene[] = [
  { id: "e1-sc1", heading: "内景 · 儿童房 · 清晨", summary: "小禾醒来，看见门边的滑板车。", lines: [line("e1-l1", "xiaohe", "今天就是探险日！"), line("e1-l2", "mom", "头盔戴好！")] },
  { id: "e1-sc2", heading: "外景 · 小区门口 · 清晨", summary: "阿豆和布丁在等候，两人出发。", lines: [line("e1-l3", "adou", "地图我带好了！")] },
  { id: "e1-sc3", heading: "外景 · 林荫道 · 日", summary: "远处森林边缘出现微光。", lines: [line("e1-l4", null, "森林里，好像有什么在等他们。")] },
];

const ep2Scenes: Scene[] = [
  { id: "e2-sc1", heading: "外景 · 森林小径 · 日", summary: "布丁跑丢，两人迷路。", lines: [line("e2-l1", "adou", "布丁，回来！"), line("e2-l2", "xiaohe", "这条路，地图上没有……")] },
  { id: "e2-sc2", heading: "外景 · 苔藓空地 · 日", summary: "森林守护者苔苔现身并带路。", lines: [line("e2-l3", "taitai", "迷路的小旅人，需要帮忙吗？"), line("e2-l4", null, "前面，是一场意想不到的比赛。")] },
];

const ep3Scenes: Scene[] = [
  { id: "e3-sc1", heading: "外景 · 公园赛道 · 雨后", summary: "比赛开始，阿豆紧张。", lines: [line("e3-l1", "xiaohe", "别怕，我们一起！")] },
  { id: "e3-sc2", heading: "外景 · 赛道中段 · 雨后", summary: "阿豆摔倒，小禾放弃领先回头帮忙。", lines: [line("e3-l2", "adou", "我不行了……"), line("e3-l3", "mom", "你们是最棒的！")] },
  { id: "e3-sc3", heading: "外景 · 终点 · 黄昏", summary: "两人一起冲线。", lines: [line("e3-l4", null, "有些终点，比第一名更重要。")] },
];

const ep4Scenes: Scene[] = [
  { id: "e4-sc1", heading: "外景 · 街道 · 黄昏", summary: "回家路上，苔苔告别。", lines: [line("e4-l1", "taitai", "下次探险见！")] },
  { id: "e4-sc2", heading: "内景 · 家 · 夜", summary: "晚餐分享冒险，滑板车回到原位。", lines: [line("e4-l2", "xiaohe", "妈妈，今天我们帮了森林守护者！"), line("e4-l3", null, "每一次出发，都是一次长大。")] },
  { id: "e4-sc3", heading: "品牌落版", summary: "产品原图 + Logo，不使用 AI 重绘。", lines: [line("e4-l4", null, "品牌标语（待用户提供）")] },
];

export const demoEpisodes: Episode[] = [
  {
    number: 1,
    title: "出发的清晨",
    targetSeconds: 45,
    synopsis: "小禾和阿豆骑上滑板车出发，森林边缘出现神秘微光。",
    scenes: ep1Scenes,
    shots: buildShots(1, [
      [5, "固定", "清晨阳光照进儿童房，滑板车靠在门边（产品建议原图合成）", [], "", "主体"],
      [7, "推近", "小禾醒来看见滑板车，眼睛一亮", ["xiaohe"], "小禾：今天就是探险日！", "主体"],
      [6, "跟拍", "小禾推着滑板车跑过客厅", ["xiaohe", "mom"], "林妈妈：头盔戴好！", "主体"],
      [6, "固定", "窗台上猫咪伸懒腰（彩蛋 2 秒），切到门口", [], "", "无", true],
      [7, "横摇", "小区门口，阿豆和柯基布丁在等候", ["adou", "pudding"], "阿豆：地图我带好了！", "背景"],
      [7, "跟拍", "两人骑行穿过林荫道", ["xiaohe", "adou", "pudding"], "", "主体"],
      [7, "拉远", "远处森林边缘出现一道微光", ["xiaohe", "adou"], "旁白：森林里，好像有什么在等他们。", "背景"],
    ]),
  },
  {
    number: 2,
    title: "森林小径",
    targetSeconds: 45,
    synopsis: "两人迷路，遇见森林守护者苔苔，被带往一场比赛。",
    scenes: ep2Scenes,
    shots: buildShots(2, [
      [6, "俯拍", "森林小径全景，两辆滑板车穿行", ["xiaohe", "adou"], "", "背景"],
      [7, "手持", "布丁冲进灌木丛", ["pudding", "adou"], "阿豆：布丁，回来！", "无"],
      [6, "推近", "小禾查看地图，发现迷路", ["xiaohe"], "小禾：这条路，地图上没有……", "无"],
      [8, "环绕", "苔苔从苔藓中现身", ["taitai", "xiaohe", "adou"], "苔苔：迷路的小旅人，需要帮忙吗？", "无"],
      [6, "固定", "树洞旁猫咪探头又缩回（彩蛋 2 秒）", [], "", "无", true],
      [6, "跟拍", "苔苔领路，发光轮照亮小径（产品功能，建议可控动画）", ["xiaohe", "taitai"], "", "主体"],
      [6, "拉远", "走出森林，看见比赛横幅", ["xiaohe", "adou", "pudding"], "旁白：前面，是一场意想不到的比赛。", "背景"],
    ]),
  },
  {
    number: 3,
    title: "雨后的比赛",
    targetSeconds: 45,
    synopsis: "比赛中阿豆摔倒，小禾选择回头，两人一起冲线。",
    scenes: ep3Scenes,
    shots: buildShots(3, [
      [6, "横摇", "雨后公园，儿童滑行赛起点（多人镜头，高复杂度）", ["crowd", "xiaohe", "adou"], "", "背景"],
      [7, "推近", "阿豆紧张，小禾为他打气", ["adou", "xiaohe"], "小禾：别怕，我们一起！", "主体"],
      [6, "跟拍", "出发！积水路面稳稳滑过（建议可控动画）", ["xiaohe", "adou"], "", "主体"],
      [7, "手持", "阿豆摔倒，小禾停下", ["adou", "xiaohe"], "阿豆：我不行了……", "背景"],
      [6, "固定", "观众席长椅下猫咪舔爪（彩蛋 1 秒）", ["crowd"], "", "无", true],
      [7, "推近", "小禾扶起阿豆，两人推车走向终点", ["xiaohe", "adou", "mom"], "林妈妈：你们是最棒的！", "主体"],
      [6, "拉远", "夕阳下两人一起冲线", ["xiaohe", "adou", "crowd"], "旁白：有些终点，比第一名更重要。", "背景"],
    ]),
  },
  {
    number: 4,
    title: "回家的路",
    targetSeconds: 45,
    synopsis: "告别苔苔回到家，滑板车回到第一集的位置，首尾呼应。",
    scenes: ep4Scenes,
    shots: buildShots(4, [
      [6, "跟拍", "黄昏街道，三人一狗骑行回家（多人镜头）", ["xiaohe", "adou", "mom", "pudding"], "", "主体"],
      [7, "推近", "苔苔在路边树影里挥手告别", ["taitai", "xiaohe"], "苔苔：下次探险见！", "无"],
      [6, "固定", "家门口，滑板车停回原位（呼应第 1 集首镜）", ["xiaohe"], "", "主体"],
      [6, "横摇", "晚餐桌上讲述冒险", ["xiaohe", "mom"], "小禾：妈妈，今天我们帮了森林守护者！", "无"],
      [7, "推近", "猫咪蜷在滑板车旁睡着（彩蛋 3 秒）", [], "", "背景", true],
      [7, "拉远", "小禾在窗边画下探险地图", ["xiaohe"], "旁白：每一次出发，都是一次长大。", "无"],
      [6, "固定", "品牌落版：产品原图 + Logo（禁止 AI 重绘）", [], "品牌标语（待用户提供）", "主体"],
    ]),
  },
];

export function getProject(id: string): Project | undefined {
  return id === DEMO_PROJECT_ID ? demoProject : undefined;
}

export function totalSeconds(shots: Shot[]): number {
  return shots.reduce((sum, s) => sum + s.seconds, 0);
}
