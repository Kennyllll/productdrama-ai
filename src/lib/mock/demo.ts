// 演示用本地模拟数据（TASK-001）。所有内容均为示例，不代表真实产品信息或 AI 生成结果。
import type {
  Beat,
  CameraAngle,
  Character,
  CameraMove,
  LensMm,
  ShotSize,
  Transition,
  VisualSpec,
  FilmStyle,
  Episode,
  EpisodeNumber,
  OptionItem,
  PetEasterEgg,
  Product,
  ProductBibleField,
  ProductPresence,
  Project,
  Scene,
  Shot,
  StoryProposal,
} from "@/lib/types";

export const DEMO_PROJECT_ID = "demo";

export const demoProject: Project = {
  id: DEMO_PROJECT_ID,
  source: "demo",
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

/** 新建本地项目时的 Product Bible 模板（字段与示例一致，值为空） */
export const emptyBible: ProductBibleField[] = demoProduct.bible.map((f) => ({ ...f, value: "", needsConfirmation: true }));

export const productAngles: string[] = demoProduct.imageSlots.map((s) => s.angle);

export const localStepStatus: Project["stepStatus"] = {
  product: "in_progress",
  creative: "todo",
  casting: "todo",
  script: "todo",
  storyboard: "todo",
  video: "todo",
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

export const filmStyles: FilmStyle[] = [
  {
    id: "et",
    kind: "live-action",
    genre: "奇幻冒险 · 家庭",
    film: "E.T. 外星人",
    director: "史蒂文·斯皮尔伯格",
    year: 1982,
    keywords: ["童年奇遇", "逆光剪影", "烟雾体积光", "儿童视角"],
    palette: [
      { hex: "#1b2a4a", name: "夜空深蓝" },
      { hex: "#8fa9c9", name: "月光银蓝" },
      { hex: "#f2a65a", name: "暖橙逆光" },
      { hex: "#5b6270", name: "烟雾灰" },
    ],
    lighting: "强逆光 + 烟雾体积光；手电、车灯作为画内光源；夜景蓝与暖色光形成对比",
    camera: "机位放在儿童视线高度，成人常被裁到腰部以下；缓慢推近；逆光剪影大远景",
    composition: "剪影构图，大面积天空作为负空间",
    suggestedAspect: "1.85:1",
    productTreatment: "低机位英雄镜头，用逆光轮廓光勾勒车身线条；发光轮 / 车灯作为画内光源照亮孩子的脸；剪影中产品轮廓必须清晰可辨。",
    heroShots: [
      "黄昏逆光大远景：孩子骑滑板车越过坡顶，产品剪影轮廓清晰",
      "儿童视线低机位：车轮滚过落叶，光柱穿过薄雾",
      "夜色中发光轮亮起，照亮孩子惊喜的脸",
    ],
    caution: "只借鉴光线与视角，不复刻原片标志性画面（如月亮前飞车）、角色和配乐。",
  },
  {
    id: "grand-budapest",
    kind: "live-action",
    genre: "喜剧 · 风格化美学",
    film: "布达佩斯大饭店",
    director: "韦斯·安德森",
    year: 2014,
    keywords: ["中轴对称", "粉彩色", "微缩舞台感", "横移 / 甩摇"],
    palette: [
      { hex: "#e8a5b5", name: "糖果粉" },
      { hex: "#b49fcc", name: "薰衣草紫" },
      { hex: "#f3dfa2", name: "奶油黄" },
      { hex: "#8c2f39", name: "酒红" },
    ],
    lighting: "均匀柔和的平光，阴影少，色块干净",
    camera: "固定机位居中；精确的横移跟拍与 90° 甩摇；快速推拉",
    composition: "中轴对称，人物正对镜头，画面像微缩舞台",
    suggestedAspect: "1.85:1（原片按年代切换 1.37 / 1.85 / 2.35:1）",
    productTreatment: "产品放在画面中轴线上，正面或正侧面平视展示；用与产品主色协调的粉彩布景衬托，产品本身颜色不改。",
    heroShots: [
      "正面对称构图：滑板车立在粉色门厅正中，两侧道具对称",
      "俯拍平铺：头盔、地图、滑板车整齐排列",
      "横移跟拍：孩子骑行经过一排对称的彩色门",
    ],
    caution: "只借鉴构图与色彩方法，不复刻原片布景、角色和字体设计。",
  },
  {
    id: "paddington2",
    kind: "live-action",
    genre: "家庭喜剧",
    film: "帕丁顿熊 2",
    director: "保罗·金",
    year: 2017,
    keywords: ["温暖童话", "立体绘本感", "英伦街景", "机关式转场"],
    palette: [
      { hex: "#e07a2f", name: "果酱橙" },
      { hex: "#b23a3a", name: "伦敦红" },
      { hex: "#9cc9b4", name: "薄荷绿" },
      { hex: "#f5e6c8", name: "暖奶油" },
    ],
    lighting: "温暖柔光，室内暖黄，窗光柔和",
    camera: "平滑推轨与升降；转场像翻开立体书",
    composition: "前、中、后景层次丰富，色彩分区明确",
    suggestedAspect: "2.39:1",
    productTreatment: "产品融入温暖的家庭和街景布景，作为推动童话情节的道具；暖色布景衬托，产品始终清晰对焦。",
    heroShots: [
      "立体书式转场：书页翻开，滑板车出现在彩色街道上",
      "暖色厨房中景：孩子推车出门，前景果酱罐虚化",
      "升降镜头：孩子骑行穿过色彩分区的街道",
    ],
    caution: "不使用帕丁顿熊形象及原片角色、配乐。",
  },
  {
    id: "transformers",
    kind: "live-action",
    genre: "科幻动作",
    film: "变形金刚",
    director: "迈克尔·贝",
    year: 2007,
    keywords: ["英雄镜头", "青橙调色", "镜头光晕", "360° 环绕"],
    palette: [
      { hex: "#ff8a3d", name: "夕阳橙" },
      { hex: "#1f6f8b", name: "青蓝" },
      { hex: "#6e7781", name: "金属灰" },
      { hex: "#f6c35b", name: "天空金" },
    ],
    lighting: "夕阳逆光，强烈镜头光晕，高对比",
    camera: "低机位仰拍 + 360° 环绕；慢动作；长焦压缩背景",
    composition: "主体自下而上的英雄构图，天空占比大",
    suggestedAspect: "2.39:1",
    productTreatment: "把产品当作英雄：低角度慢动作环绕，突出轮毂与金属高光；镜头光晕不得遮挡 Logo；高速镜头建议可控动画或原图合成。",
    heroShots: [
      "夕阳下低机位 360° 环绕：滑板车静置坡顶，光晕掠过",
      "慢动作：车轮落地溅起水花，长焦压缩背景",
      "仰拍英雄构图：孩子一脚踩上踏板，天空占画面 2/3",
    ],
    caution: "儿童内容避免危险动作；不使用原片机器人形象与配乐。",
  },
  {
    id: "kiseki",
    kind: "live-action",
    genre: "生活写实",
    film: "奇迹",
    director: "是枝裕和",
    year: 2011,
    keywords: ["自然光", "生活质感", "儿童群像", "纪实手持"],
    palette: [
      { hex: "#9cc3e0", name: "晴空蓝" },
      { hex: "#8fb174", name: "稻田绿" },
      { hex: "#ede6d6", name: "米白" },
      { hex: "#e9b384", name: "夕阳杏" },
    ],
    lighting: "以自然光为主，日光柔和，少人工布光",
    camera: "手持或固定长镜头，平视儿童高度，跟随孩子的自然动作",
    composition: "留白多，人物在环境中显得小，生活化",
    suggestedAspect: "1.85:1",
    productTreatment: "产品作为生活中自然存在的物件，出现在真实场景（乡间小路、铁路边），不刻意摆拍；自然光下真实呈现材质。",
    heroShots: [
      "乡间小路长镜头：几个孩子推着滑板车说笑走来",
      "自然光近景：孩子蹲下擦拭车轮",
      "夕阳下铁路边：滑板车停在草地，孩子背影远眺",
    ],
    caution: "只借鉴自然主义拍法，不复刻原片情节与角色。",
  },
  {
    id: "amelie",
    kind: "live-action",
    genre: "浪漫奇想",
    film: "天使爱美丽",
    director: "让-皮埃尔·热内",
    year: 2001,
    keywords: ["奇趣幻想", "红绿金调色", "广角特写", "细节蒙太奇"],
    palette: [
      { hex: "#2e6b3f", name: "祖母绿" },
      { hex: "#c0392b", name: "番茄红" },
      { hex: "#d4a017", name: "暖金" },
      { hex: "#4a2c1a", name: "深棕" },
    ],
    lighting: "暖金色调，高饱和，局部聚光",
    camera: "广角近距离特写，快速推镜，细节蒙太奇",
    composition: "夸张的广角人物近景，趣味道具细节",
    suggestedAspect: "2.39:1",
    productTreatment: "用产品细节蒙太奇（把手纹理、车轮、开关）制造奇趣节奏；人物可用广角，产品镜头使用 ≥ 35mm 或原图合成，避免变形。",
    heroShots: [
      "细节蒙太奇：把手、踏板、发光轮快速切换（原图合成）",
      "暖金聚光下孩子惊喜的广角近景，产品在中景",
      "红绿配色的房间里，滑板车像秘密道具一样被揭开",
    ],
    caution: "只借鉴调色与节奏，不复刻原片画面、角色和配乐。",
  },
  {
    id: "ford-v-ferrari",
    kind: "live-action",
    genre: "赛车 · 成人向",
    film: "极速车王",
    director: "詹姆斯·曼高德",
    year: 2019,
    keywords: ["写实速度感", "贴地车载机位", "复古胶片", "人车交替剪辑"],
    palette: [
      { hex: "#d9a441", name: "沙漠金" },
      { hex: "#2f5d8a", name: "复古蓝" },
      { hex: "#b8312f", name: "赛车红" },
      { hex: "#4b4f54", name: "赛道灰" },
    ],
    lighting: "自然硬光与午后阳光，暖色胶片质感，热浪与尘土增加空气感",
    camera: "贴地车载机位与平行跟车；脚踩踏板、眼神、车轮特写快速交替；速度靠背景运动模糊表现",
    composition: "低地平线，赛道引导线指向画面深处，主体常放在三分线上",
    suggestedAspect: "2.39:1",
    productTreatment: "贴地机位跟拍车轮滚动，与孩子脚踩踏板、专注眼神的特写交替剪辑；平行跟车展示产品完整侧面轮廓；速度感只来自背景模糊，产品本身保持清晰不变形。",
    heroShots: [
      "贴地跟拍：车轮掠过镜头，背景拉成速度线，产品轮廓清晰",
      "特写交替：孩子眼神 → 脚踩踏板 → 车轮压过终点线",
      "平行跟车侧面：夕阳下产品完整侧影划过画面",
    ],
    caution: "只借鉴机位与剪辑节奏；儿童内容不表现危险高速和碰撞，不复刻原片车辆、角色和配乐。",
  },
  {
    id: "furious7",
    kind: "live-action",
    genre: "赛车动作 · 成人向",
    film: "速度与激情 7",
    director: "温子仁",
    year: 2015,
    keywords: ["肌肉车美学", "夜景霓虹", "极限慢动作", "车库揭幕"],
    palette: [
      { hex: "#ff7a1a", name: "霓虹橙" },
      { hex: "#1c2b4a", name: "夜城蓝" },
      { hex: "#c9ccd1", name: "镀铬银" },
      { hex: "#d7263d", name: "尾灯红" },
    ],
    lighting: "夜景霓虹与雨后湿地面反射；车库顶灯硬光；强烈轮廓光勾勒车身",
    camera: "贴地低机位推轨；车轮与机构特写；慢动作与变速；绕车 360° 环绕",
    composition: "产品居中低角度仰拍，湿地面倒影形成上下对称",
    suggestedAspect: "2.39:1",
    productTreatment: "按超跑广告来拍，面向成人买家：卷帘门升起、顶灯逐排点亮的车库揭幕；霓虹轮廓光和湿地面倒影勾勒车身；折叠机构、轴承、把手做微距特写，强调质感和可靠。儿童骑行只在安全场地、正常速度下拍。",
    heroShots: [
      "车库揭幕：卷帘门升起，顶灯逐排点亮，滑板车静置中央",
      "雨后夜街：湿地面倒映霓虹与车身，低机位缓推",
      "工艺微距：折叠机构慢动作咔嗒锁紧",
    ],
    caution: "只借鉴光线、机位与节奏；不复刻原片车辆、特技、角色和配乐；不表现街头飙车等危险驾驶。",
  },
  {
    id: "f1",
    kind: "live-action",
    genre: "赛车 · 成人向",
    film: "F1：狂飙飞车",
    director: "约瑟夫·科辛斯基",
    year: 2025,
    keywords: ["车载实拍视角", "冷峻高级感", "工程细节", "长焦追拍"],
    palette: [
      { hex: "#1a1a1d", name: "碳纤黑" },
      { hex: "#eceff1", name: "赛道白" },
      { hex: "#f5c518", name: "警示黄" },
      { hex: "#4a6d8c", name: "冷钢蓝" },
    ],
    lighting: "自然日光为主，反差高而干净；金属与碳纤材质带冷色高光",
    camera: "车载固定机位第一人称；长焦赛道追拍；维修区手持跟拍",
    composition: "干净的几何线条，大量留白，突出工程感",
    suggestedAspect: "2.39:1",
    productTreatment: "像展示工程产品一样拍：维修区式工作台上排列零件和组装过程；车把视角的固定机位展示把手和前方道路；长焦追拍展示整车侧影。色调冷峻高级，突出材质和做工。",
    heroShots: [
      "工作台俯拍：车轮、把手、折叠件像赛车零件一样排列",
      "车把视角固定机位：前方道路延伸，把手细节清晰",
      "长焦侧面追拍：大人陪孩子骑行，整车轮廓清晰",
    ],
    caution: "不使用 F1 商标、车队标识、原片角色和配乐。",
  },
  {
    id: "rush",
    kind: "live-action",
    genre: "赛车传记 · 成人向",
    film: "极速风流",
    director: "朗·霍华德",
    year: 2013,
    keywords: ["70 年代胶片", "宿命对决", "极近特写", "高颗粒"],
    palette: [
      { hex: "#6b6b3a", name: "复古橄榄" },
      { hex: "#a63d32", name: "褪色红" },
      { hex: "#c58a3e", name: "胶片琥珀" },
      { hex: "#3b3b3b", name: "烟灰" },
    ],
    lighting: "暖色胶片质感，高颗粒；逆光与镜头眩光；阴天柔光",
    camera: "眼睛、手、机械部件的极近特写；快速蒙太奇；局促的近身机位",
    composition: "人物面部与机械细节交替，浅景深",
    suggestedAspect: "2.39:1",
    productTreatment: "用“人与机器”的关系打动成人：大人的手调节把手高度、拧紧部件的极近特写，与孩子的眼神交替；胶片颗粒和琥珀调色营造怀旧情绪，产品区域做颜色保护，不被调黄。",
    heroShots: [
      "极近特写：大人的手为孩子拧紧把手",
      "胶片颗粒蒙太奇：车轮、眼神、起跑线快速交替",
      "逆光眩光中，父亲和孩子推车走向起点",
    ],
    caution: "只借鉴胶片质感与剪辑；不复刻原片车手形象、真实赛事标识和配乐。",
  },
  {
    id: "overwatch",
    kind: "game-cg",
    genre: "科幻英雄",
    film: "守望先锋 动画短片",
    director: "暴雪娱乐",
    year: 2016,
    keywords: ["皮克斯式角色", "明亮未来感", "夸张表情", "动作喜剧节奏"],
    palette: [
      { hex: "#f99e1a", name: "活力橙" },
      { hex: "#4fc1e9", name: "科技蓝" },
      { hex: "#f5f0e6", name: "象牙白" },
      { hex: "#3d4a5c", name: "石板灰" },
    ],
    lighting: "明亮的日光与柔和的全局光，边缘光勾出角色轮廓，色彩干净饱和",
    camera: "动作段落快速推拉与跟拍；表情特写；关键动作放慢后再加速",
    composition: "角色剪影清晰易读，动作方向明确，背景层次丰富",
    suggestedAspect: "2.39:1",
    productTreatment: "孩子按 3D 动画角色风格呈现，产品保持写实质感（原图合成或高精度建模）；边缘光勾出车身轮廓；关键动作（起步、跳过水坑）先放慢再加速，让产品在高光时刻清晰可见。",
    heroShots: [
      "起步瞬间放慢：孩子一脚蹬地，边缘光勾出车身",
      "跟拍喜剧节奏：孩子和伙伴骑车穿过集市，差点撞到水果摊",
      "表情特写切产品特写：孩子咧嘴笑 → 发光轮亮起",
    ],
    caution: "只借鉴光线、角色动画质感与节奏；不使用守望先锋英雄形象、Logo、场景和配乐，避免枪战等暴力元素。",
  },
  {
    id: "warcraft",
    kind: "game-cg",
    genre: "史诗奇幻",
    film: "魔兽世界 CG",
    director: "暴雪娱乐",
    year: 2004,
    keywords: ["史诗奇幻", "体积光", "航拍大场面", "英雄登场"],
    palette: [
      { hex: "#1f5f4a", name: "翡翠绿" },
      { hex: "#c9a227", name: "古金" },
      { hex: "#2b3a67", name: "暮色蓝" },
      { hex: "#8a5a3b", name: "古木棕" },
    ],
    lighting: "体积光穿过云层与树林，金色主光加冷色环境光，戏剧化明暗",
    camera: "航拍俯冲穿过云层；大场面缓慢环绕；英雄登场时由背面推到正面",
    composition: "渺小人物对比宏大自然景观，前景用剪影加深纵深",
    suggestedAspect: "2.39:1",
    productTreatment: "把产品当作“传奇装备”登场：金色体积光照亮车身，镜头由背面缓推到正面；魔法粒子只出现在环境里，不覆盖产品和 Logo。",
    heroShots: [
      "航拍俯冲：穿过云层，落到森林空地上的滑板车",
      "传奇装备登场：光柱落下，由车尾缓推到车头",
      "大场面剪影：孩子骑车站在山顶，远处是宏大山谷",
    ],
    caution: "儿童内容避免战争和暴力；不使用魔兽种族、角色、Logo 和配乐。",
  },
  {
    id: "hearthstone",
    kind: "game-cg",
    genre: "奇幻 · 温暖酒馆",
    film: "炉石传说 CG",
    director: "暴雪娱乐",
    year: 2014,
    keywords: ["温馨酒馆", "卡通质感", "桌面微距", "开箱揭晓"],
    palette: [
      { hex: "#8b4a2b", name: "木纹棕" },
      { hex: "#f2b134", name: "烛光金" },
      { hex: "#3e6fb0", name: "卡牌蓝" },
      { hex: "#e6d3b3", name: "羊皮纸" },
    ],
    lighting: "壁炉和烛光的暖色主光，室内温馨，局部金色高光",
    camera: "桌面高度微距推轨；长镜头穿过热闹人群；揭晓时镜头快速推近",
    composition: "桌面道具前景丰富，人物围成一圈，视线集中到中心",
    suggestedAspect: "1.85:1",
    productTreatment: "产品像“传说卡牌”一样被揭晓：礼盒打开，暖金光从里面溢出，镜头快速推近产品；桌面微距展示把手和车轮的材质细节。",
    heroShots: [
      "开箱揭晓：礼盒打开，暖金光照亮滑板车",
      "壁炉旁：一群孩子围着产品，镜头从人群缝隙推进",
      "桌面微距：把手纹理和发光轮在烛光下特写",
    ],
    caution: "不使用炉石卡牌设计、角色、Logo 和配乐；只借鉴光线与氛围。",
  },
  {
    id: "spider-verse",
    kind: "animation",
    genre: "超级英雄 · 街头潮流",
    film: "蜘蛛侠：平行宇宙",
    director: "鲍勃·佩尔西凯蒂 / 彼得·拉姆齐 / 罗德尼·罗斯曼",
    year: 2018,
    keywords: ["漫画网点", "色彩错位", "涂鸦霓虹", "抽帧节奏"],
    palette: [
      { hex: "#e4002b", name: "漫画红" },
      { hex: "#00b4d8", name: "电光青" },
      { hex: "#ffd60a", name: "网点黄" },
      { hex: "#1a1033", name: "夜紫" },
    ],
    lighting: "高饱和霓虹与轮廓光；阴影用网点与排线表现；局部 RGB 色差错位制造冲击",
    camera: "一拍二的抽帧动作与流畅镜头交替；倒置、俯冲等夸张机位；速度线与定格分格",
    composition: "漫画分格、强对角线构图，画面内拟声字效",
    suggestedAspect: "2.39:1",
    productTreatment: "产品保持真实材质和原色，不做网点或色差处理；背景与角色漫画化，用来衬托写实的产品；定格分格依次展示产品三个角度。",
    heroShots: [
      "三分格定格：车轮、把手、整车依次弹出",
      "城市屋顶俯冲镜头，产品落地瞬间画面定格成漫画封面",
      "霓虹涂鸦墙前，产品轮廓被电光青勾边",
    ],
    caution: "不使用蜘蛛侠角色、战衣、标志和原片字体；只借鉴视觉语法。",
  },
  {
    id: "up",
    kind: "animation",
    genre: "温情冒险 · 家庭",
    film: "飞屋环游记",
    director: "彼特·道格特（皮克斯）",
    year: 2009,
    keywords: ["温暖怀旧", "形状语言", "情感蒙太奇", "黄金时刻"],
    palette: [
      { hex: "#f4a259", name: "夕阳橙" },
      { hex: "#7fb7be", name: "天空青" },
      { hex: "#e63946", name: "气球红" },
      { hex: "#f1e3c6", name: "旧照米" },
    ],
    lighting: "柔和暖色主光与黄金时刻；回忆段落降低饱和度并加柔光",
    camera: "平稳的中景与远景；情感段落用固定机位蒙太奇；升空镜头缓慢上摇",
    composition: "圆与方的形状对比，大面积天空留白，用色块引导视线",
    suggestedAspect: "1.85:1",
    productTreatment: "产品作为承载回忆的物件，在暖光中出现；用同机位蒙太奇展示孩子与产品一起度过四季；产品原色是画面里最饱和的色块。",
    heroShots: [
      "四季蒙太奇：同一机位，产品陪孩子从春天到冬天",
      "夕阳门廊，产品停在台阶旁，背景彩色气球缓缓升起",
      "褪色旧照片过渡到现在，产品原色重新出现",
    ],
    caution: "不使用飞屋、气球房子造型、角色和配乐。",
  },
  {
    id: "totoro",
    kind: "animation",
    genre: "自然童年 · 治愈",
    film: "龙猫",
    director: "宫崎骏（吉卜力）",
    year: 1988,
    keywords: ["田园夏日", "手绘背景", "雨天等待", "静谧留白"],
    palette: [
      { hex: "#4f7942", name: "稻田绿" },
      { hex: "#a7c7e7", name: "夏空蓝" },
      { hex: "#f6e7b0", name: "午后米黄" },
      { hex: "#5a4632", name: "木屋棕" },
    ],
    lighting: "自然漫射光，树荫下斑驳光点；雨天柔和灰光与湿润反光",
    camera: "固定机位与缓慢横移为主，保留空镜的时间感；儿童视线高度",
    composition: "自然环境占画面大部分，人物与产品较小，强调季节与环境",
    suggestedAspect: "1.85:1",
    productTreatment: "产品融入田园场景，是孩子探索自然的伙伴；用空镜和静止时刻展示细节，例如雨后水珠挂在车身上的特写。",
    heroShots: [
      "雨后小路，产品停在大树下，叶尖水珠滴落在车把上",
      "稻田边孩子推着产品前进，镜头缓慢横移",
      "夏夜萤火虫从产品周围飘过",
    ],
    caution: "不使用龙猫、猫巴士等角色及吉卜力标识与配乐。",
  },
  {
    id: "httyd",
    kind: "animation",
    genre: "史诗冒险 · 飞行",
    film: "驯龙高手",
    director: "迪恩·德布洛斯 / 克里斯·桑德斯（梦工厂）",
    year: 2010,
    keywords: ["飞行自由", "云海光束", "摄影级布光", "跟随长镜头"],
    palette: [
      { hex: "#2e4a62", name: "海雾蓝" },
      { hex: "#f9c784", name: "云顶金" },
      { hex: "#3d3d3d", name: "岩石灰" },
      { hex: "#8fb996", name: "苔藓绿" },
    ],
    lighting: "摄影级布光（罗杰·迪金斯任视觉顾问）：云层透光、体积光束、日出逆光",
    camera: "跟随飞行的长镜头，大幅度升降与环绕；穿插第一人称视角",
    composition: "大全景里的小主体，用云海和海崖拉开宏大尺度",
    suggestedAspect: "1.85:1",
    productTreatment: "用飞行般的跟拍表现自由感：产品贴地滑行时镜头像飞龙一样俯冲跟随；日出逆光勾勒产品轮廓。速度感靠机位和背景运动，孩子不做危险动作。",
    heroShots: [
      "日出坡道，镜头从高空俯冲到贴地跟拍产品",
      "云影掠过草地，产品在光斑中穿行",
      "环绕镜头：孩子停下张开双臂，产品在前景",
    ],
    caution: "不使用龙和维京角色设计及原片配乐。",
  },
];

export const referenceKindLabels: Record<FilmStyle["kind"], string> = {
  "live-action": "真人电影",
  animation: "动画",
  "game-cg": "游戏 CG",
};

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
    visualStyleId: "et",
    productRoleId: "companion",
    episodeArcs: ["出发的清晨", "森林小径", "雨后的比赛", "回家的路"],
  },
  {
    id: "p-champion",
    title: "冠军之路",
    logline: "不敢参加比赛的孩子，在朋友和滑板车的陪伴下完成第一次挑战。",
    themeIds: ["sports", "friendship"],
    visualStyleId: "transformers",
    productRoleId: "key-prop",
    episodeArcs: ["报名", "训练", "意外", "冲线"],
  },
  {
    id: "p-weekend",
    title: "和妈妈的周末",
    logline: "忙碌的妈妈与孩子用四个周末重新认识彼此，滑板车见证了他们的变化。",
    themeIds: ["family", "adventure"],
    visualStyleId: "kiseki",
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
    "示例彩蛋角色为猫；实际项目在「彩蛋角色库」中选用，可以是任何角色",
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

export const demoVisualSpec: VisualSpec = {
  filmReference: "《E.T. 外星人》风格参考",
  aspectRatio: "1.85:1",
  fps: 24,
  colorGrade: "夜景蓝 + 暖橙逆光（产品区域颜色保护）",
  grain: "轻度 35mm 胶片颗粒",
  lensPackage: "球面定焦 24 / 35 / 50 / 85mm",
  depthOfField: "浅景深为主，产品镜头保证清晰",
};

export const beatTypeLabel: Record<Beat["type"], string> = {
  hook: "开场钩子",
  conflict: "冲突",
  turn: "转折",
  cliffhanger: "结尾悬念",
  resolution: "收束",
};

type ShotSeed = [number, CameraMove, string, string[], string, ProductPresence, boolean?];
/** 景别、焦距、机位、构图、光线、转场、声音、连续性 */
type CineSeed = [ShotSize, LensMm, CameraAngle, string, string, Transition, string, string];

function buildShots(ep: EpisodeNumber, seeds: ShotSeed[], cine: CineSeed[]): Shot[] {
  return seeds.map(([seconds, camera, description, characterIds, dialogue, product, pet], i) => {
    const [size, lens, angle, composition, lighting, transition, sound, continuity] = cine[i];
    return {
      id: `e${ep}-s${i + 1}`,
      index: i + 1,
      seconds,
      camera,
      description,
      characterIds,
      dialogue,
      product,
      hasPetEasterEgg: pet ?? false,
      size,
      lens,
      angle,
      composition,
      lighting,
      transition,
      sound,
      continuity,
    };
  });
}

function beat(type: Beat["type"], startSec: number, endSec: number, description: string, intensity: Beat["intensity"]): Beat {
  return { type, startSec, endSec, description, intensity };
}

const ep1Cine: CineSeed[] = [
  ["全景", 35, "平视", "门框构图，滑板车位于右三分线", "清晨侧逆光，暖色 3200K，窗光体积光", "叠化", "鸟鸣 + 远处城市底噪", ""],
  ["近景", 85, "平视", "小禾面部居左，视线看向画右", "柔和窗光主光，暗部保留阴影", "匹配剪辑", "被子摩擦声，钢琴主题进入", "视线方向 → 画右"],
  ["中景", 35, "低机位", "前景虚化家具，引导线指向门口", "室内混合光，暖调", "硬切", "脚步声 + 妈妈画外音", "小禾由左向右运动，保持轴线"],
  ["中景", 50, "平视", "窗框框住猫咪，左侧留白", "逆光轮廓光", "L-Cut", "猫咪轻声呼噜（可选）", "彩蛋 2 秒后切门口"],
  ["全景", 24, "平视", "对称构图，小区门洞", "晨光顺光，空气透视", "硬切", "一声狗叫引入阿豆台词", "阿豆在画左，小禾从画右入画"],
  ["远景", 50, "低机位", "长焦压缩林荫道，人物居中", "斑驳树影光", "甩镜", "车轮滚动声，主题音乐上扬", "运动方向保持左 → 右"],
  ["大远景", 135, "高机位", "人物占画面 1/10，微光在右上", "黄金时刻逆光，镜头光晕", "淡出", "音乐收束，低频悬念音", "集尾钩子"],
];

const ep2Cine: CineSeed[] = [
  ["大远景", 18, "俯视", "航拍俯视，小径 S 形引导线", "林间顶光漏光", "硬切", "森林环境声", "运动左 → 右，延续第 1 集"],
  ["中景", 24, "平视", "手持跟随布丁，画面轻微晃动", "高反差林下光", "硬切", "灌木沙沙声，阿豆喊声", ""],
  ["特写", 85, "过肩", "过肩看地图，地图占画面下 2/3", "冷调阴影，5600K", "叠化", "音乐停，只剩风声", "情绪转冷"],
  ["中景", 35, "低机位", "苔苔居中，孩子在前景虚化", "绿色魔幻轮廓光 + 体积雾", "硬切", "魔幻音色，低语般台词", "苔苔首次亮相，后续造型需一致"],
  ["近景", 50, "平视", "树洞框中构图", "暗部留黑，眼神光", "硬切", "轻微爪声（可选）", "彩蛋 2 秒"],
  ["全景", 35, "平视", "车灯作为主光源，前景萤火", "发光轮为实景光源，冷暖对比", "匹配剪辑", "主题音乐回归", "产品功能镜头"],
  ["大远景", 24, "低机位", "森林出口亮光框住三个剪影", "强逆光剪影", "淡出", "欢呼声提前进入", "集尾钩子"],
];

const ep3Cine: CineSeed[] = [
  ["远景", 24, "高机位", "起点横幅水平线，人群分层", "雨后漫射光，地面反光", "J-Cut", "广播声 + 人群", "多人镜头：群演简化处理"],
  ["近景", 85, "过肩", "正反打：阿豆紧张 / 小禾打气", "柔光，浅景深", "硬切", "心跳声 + 台词", "正反打保持 180° 轴线"],
  ["全景", 35, "低机位", "贴地机位，水花飞溅", "雨后天光，高光反射", "硬切", "溅水声，鼓点节奏", "运动方向左 → 右"],
  ["中景", 24, "平视", "手持晃动，阿豆倒在画左", "逆光，情绪偏冷", "硬切", "音乐骤停，摔倒声", "小禾回头，视线 ← 画左"],
  ["近景", 50, "低机位", "长椅下框中构图", "地面反光", "硬切", "环境声降低", "彩蛋 1 秒"],
  ["中景", 50, "平视", "两人居中推车，妈妈在背景虚化", "夕阳侧光，暖调回归", "匹配剪辑", "主题音乐温情版", "情绪转暖"],
  ["大远景", 135, "平视", "长焦压缩夕阳，两人剪影冲线", "黄金时刻逆光", "淡出", "欢呼 + 音乐高潮", "集尾钩子"],
];

const ep4Cine: CineSeed[] = [
  ["远景", 50, "平视", "黄昏街道纵深，路灯渐亮", "黄昏蓝调 + 暖色路灯", "叠化", "城市傍晚环境声", "运动方向右 → 左（回家，与出发相反）"],
  ["近景", 85, "主观视角", "小禾主观视角看向树影中的苔苔", "树影斑驳，微弱绿光", "硬切", "风声 + 苔苔台词", "苔苔造型与第 2 集一致"],
  ["全景", 35, "平视", "与第 1 集首镜同机位、同构图", "夜间室内暖光", "匹配剪辑", "关门声", "呼应第 1 集镜头 1"],
  ["中景", 35, "平视", "餐桌三角构图", "吊灯顶光，暖调", "硬切", "餐具声 + 台词", ""],
  ["近景", 50, "高机位", "猫咪与滑板车同框，产品在背景虚化", "夜灯柔光", "叠化", "安静，轻微呼吸声", "彩蛋 3 秒；产品不能变形"],
  ["中景", 85, "平视", "窗边侧脸，地图在前景", "月光冷色 + 台灯暖色", "叠化", "旁白 + 音乐尾声", ""],
  ["特写", 100, "平视", "产品原图居中 + Logo", "棚拍光（原图合成）", "淡出", "品牌音效（待提供）", "禁止 AI 重绘产品与 Logo"],
];

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
    beats: [
      beat("hook", 0, 12, "阳光中的滑板车静物开场，小禾醒来：今天是探险日", 2),
      beat("conflict", 12, 24, "急着出门被妈妈叫住戴头盔", 3),
      beat("turn", 24, 38, "伙伴集结，骑行出发", 3),
      beat("cliffhanger", 38, 45, "森林边缘出现神秘微光", 4),
    ],
    scenes: ep1Scenes,
    shots: buildShots(1, [
      [5, "固定", "清晨阳光照进儿童房，滑板车靠在门边（产品建议原图合成）", [], "", "主体"],
      [7, "推近", "小禾醒来看见滑板车，眼睛一亮", ["xiaohe"], "小禾：今天就是探险日！", "主体"],
      [6, "跟拍", "小禾推着滑板车跑过客厅", ["xiaohe", "mom"], "林妈妈：头盔戴好！", "主体"],
      [6, "固定", "窗台上猫咪伸懒腰（彩蛋 2 秒），切到门口", [], "", "无", true],
      [7, "横摇", "小区门口，阿豆和柯基布丁在等候", ["adou", "pudding"], "阿豆：地图我带好了！", "背景"],
      [7, "跟拍", "两人骑行穿过林荫道", ["xiaohe", "adou", "pudding"], "", "主体"],
      [7, "拉远", "远处森林边缘出现一道微光", ["xiaohe", "adou"], "旁白：森林里，好像有什么在等他们。", "背景"],
    ], ep1Cine),
  },
  {
    number: 2,
    title: "森林小径",
    targetSeconds: 45,
    synopsis: "两人迷路，遇见森林守护者苔苔，被带往一场比赛。",
    beats: [
      beat("hook", 0, 13, "布丁冲进灌木丛跑丢", 3),
      beat("conflict", 13, 19, "地图上没有这条路：迷路", 4),
      beat("turn", 19, 39, "森林守护者苔苔现身，用发光轮照亮小径", 4),
      beat("cliffhanger", 39, 45, "走出森林，前方是一场比赛", 3),
    ],
    scenes: ep2Scenes,
    shots: buildShots(2, [
      [6, "俯拍", "森林小径全景，两辆滑板车穿行", ["xiaohe", "adou"], "", "背景"],
      [7, "手持", "布丁冲进灌木丛", ["pudding", "adou"], "阿豆：布丁，回来！", "无"],
      [6, "推近", "小禾查看地图，发现迷路", ["xiaohe"], "小禾：这条路，地图上没有……", "无"],
      [8, "环绕", "苔苔从苔藓中现身", ["taitai", "xiaohe", "adou"], "苔苔：迷路的小旅人，需要帮忙吗？", "无"],
      [6, "固定", "树洞旁猫咪探头又缩回（彩蛋 2 秒）", [], "", "无", true],
      [6, "跟拍", "苔苔领路，发光轮照亮小径（产品功能，建议可控动画）", ["xiaohe", "taitai"], "", "主体"],
      [6, "拉远", "走出森林，看见比赛横幅", ["xiaohe", "adou", "pudding"], "旁白：前面，是一场意想不到的比赛。", "背景"],
    ], ep2Cine),
  },
  {
    number: 3,
    title: "雨后的比赛",
    targetSeconds: 45,
    synopsis: "比赛中阿豆摔倒，小禾选择回头，两人一起冲线。",
    beats: [
      beat("hook", 0, 13, "起跑线上阿豆紧张", 3),
      beat("conflict", 13, 26, "积水路面上阿豆摔倒", 5),
      beat("turn", 26, 39, "小禾放弃领先，回头扶起阿豆", 4),
      beat("cliffhanger", 39, 45, "两人一起冲线，树影里苔苔在微笑", 5),
    ],
    scenes: ep3Scenes,
    shots: buildShots(3, [
      [6, "横摇", "雨后公园，儿童滑行赛起点（多人镜头，高复杂度）", ["crowd", "xiaohe", "adou"], "", "背景"],
      [7, "推近", "阿豆紧张，小禾为他打气", ["adou", "xiaohe"], "小禾：别怕，我们一起！", "主体"],
      [6, "跟拍", "出发！积水路面稳稳滑过（建议可控动画）", ["xiaohe", "adou"], "", "主体"],
      [7, "手持", "阿豆摔倒，小禾停下", ["adou", "xiaohe"], "阿豆：我不行了……", "背景"],
      [6, "固定", "观众席长椅下猫咪舔爪（彩蛋 1 秒）", ["crowd"], "", "无", true],
      [7, "推近", "小禾扶起阿豆，两人推车走向终点", ["xiaohe", "adou", "mom"], "林妈妈：你们是最棒的！", "主体"],
      [6, "拉远", "夕阳下两人一起冲线", ["xiaohe", "adou", "crowd"], "旁白：有些终点，比第一名更重要。", "背景"],
    ], ep3Cine),
  },
  {
    number: 4,
    title: "回家的路",
    targetSeconds: 45,
    synopsis: "告别苔苔回到家，滑板车回到第一集的位置，首尾呼应。",
    beats: [
      beat("hook", 0, 6, "黄昏归途", 3),
      beat("conflict", 6, 13, "与苔苔告别的不舍", 4),
      beat("turn", 13, 32, "回到原点：滑板车停回第 1 集的位置", 3),
      beat("resolution", 32, 45, "画下探险地图，品牌落版", 2),
    ],
    scenes: ep4Scenes,
    shots: buildShots(4, [
      [6, "跟拍", "黄昏街道，三人一狗骑行回家（多人镜头）", ["xiaohe", "adou", "mom", "pudding"], "", "主体"],
      [7, "推近", "苔苔在路边树影里挥手告别", ["taitai", "xiaohe"], "苔苔：下次探险见！", "无"],
      [6, "固定", "家门口，滑板车停回原位（呼应第 1 集首镜）", ["xiaohe"], "", "主体"],
      [6, "横摇", "晚餐桌上讲述冒险", ["xiaohe", "mom"], "小禾：妈妈，今天我们帮了森林守护者！", "无"],
      [7, "推近", "猫咪蜷在滑板车旁睡着（彩蛋 3 秒）", [], "", "背景", true],
      [7, "拉远", "小禾在窗边画下探险地图", ["xiaohe"], "旁白：每一次出发，都是一次长大。", "无"],
      [6, "固定", "品牌落版：产品原图 + Logo（禁止 AI 重绘）", [], "品牌标语（待用户提供）", "主体"],
    ], ep4Cine),
  },
];

export function getProject(id: string): Project | undefined {
  return id === DEMO_PROJECT_ID ? demoProject : undefined;
}

export function totalSeconds(shots: Shot[]): number {
  return shots.reduce((sum, s) => sum + s.seconds, 0);
}
