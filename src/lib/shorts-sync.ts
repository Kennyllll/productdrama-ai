// 分镜文字和 3D 的同步检查（纯函数，客户端和服务端共用）。
// 保存分镜文字时记下当时的 3D 关键信息（textBasis）；之后 3D 变了就标“文字过期”，并按关键词找出对不上的句子。
import type { SetLayout } from "@/lib/production-repo";
import { figuresOf, FIGURE_POSES } from "@/lib/figures";
import { findTheme, type ShotScene } from "@/lib/shorts-scenes";
import { productView } from "@/lib/shorts-set";
import type { ShortShot } from "@/lib/shorts";
import { blockingKey } from "@/lib/shorts-blocking";
import { describeOp, operatorView, opMissing, opString, parseOp, poseOf } from "@/lib/shorts-operator";

export interface ShotBasis {
  /** 场地 id@版本 */
  scene: string;
  sceneName: string;
  outdoor: boolean;
  theme: string;
  /** 人偶：「大人·扶着」这类，排过序 */
  figures: string[];
  lens: number;
  camH: number;
  /** 产品在画面里的朝向（productView 的中文） */
  view: string;
  operator: string;
  /** 3D 摆位指纹（shorts-blocking.ts） */
  block?: string;
}

export interface ShotSync {
  /** 有没有记录过文字对应的 3D（旧数据保存一次分镜后才开始跟踪） */
  tracked: boolean;
  /** 文字写好之后 3D 变了什么 */
  changes: string[];
  /** 文字和 3D 对不上的地方 */
  issues: string[];
  /** 要在 3D 里改的（人偶动作栏和 3D 接触对不上） */
  fix3d?: { msg: string; fig?: string }[];
}

const VIEW_LABEL = { head: "车头正对镜头", front34: "前 3/4 侧", side: "正侧面", rear34: "后 3/4 侧", rear: "车尾对镜头" } as const;
const poseLabel = (p: string) => FIGURE_POSES.find((x) => x.id === p)?.label ?? p;
const opLabel = describeOp;

/** 本镜实际用的场地（旧数据没有 s.scene 时由服务端按场地库解析） */
export type Place = { name: string; outdoor: boolean; sh?: ShotScene };

export function basisOf(s: ShortShot, place: Place | null): ShotBasis {
  const l = s.layout;
  const pv = l ? productView(l) : null;
  const sh = s.scene ?? place?.sh;
  return {
    scene: sh ? `${sh.id}@${sh.v}` : "",
    sceneName: place?.name ?? "",
    outdoor: place?.outdoor ?? false,
    theme: sh?.theme === "custom" ? `custom:${sh.themeText ?? ""}` : (sh?.theme ?? "none"),
    figures: l ? figuresOf(l).map((f) => `${f.kind === "adult" ? "大人" : "小孩"}·${f.action || poseLabel(f.pose)}`).sort() : [],
    lens: l ? Math.round(l.lens) : 0,
    camH: l ? Math.round(l.camPos[2] * 20) / 20 : 0,
    view: pv ? VIEW_LABEL[pv.kind] : "",
    operator: opString(parseOp(s.operator)),
    block: l ? blockingKey(l) : "",
  };
}

const themeName = (t: string) => (t.startsWith("custom:") ? `自定义（${t.slice(7) || "未写"}）` : findTheme(t).label);

function countDiff(a: string[], b: string[]): string {
  const left = [...a];
  const added: string[] = [];
  for (const x of b) {
    const k = left.indexOf(x);
    if (k >= 0) left.splice(k, 1);
    else added.push(x);
  }
  return [left.length ? `少了 ${left.join("、")}` : "", added.length ? `多了 ${added.join("、")}` : ""].filter(Boolean).join("；");
}

export function diffBasis(a: ShotBasis, b: ShotBasis): string[] {
  const out: string[] = [];
  if (a.scene !== b.scene) out.push(a.sceneName === b.sceneName ? `场地版本变了（${a.scene.split("@")[1] ?? "?"} → ${b.scene.split("@")[1] ?? "?"}）` : `场地：${a.sceneName || "未设"} → ${b.sceneName || "未设"}`);
  if (a.theme !== b.theme) out.push(`主题：${themeName(a.theme)} → ${themeName(b.theme)}`);
  const f = countDiff(a.figures, b.figures);
  if (f) out.push(`人偶：${f}`);
  if (Math.abs(a.lens - b.lens) >= 5) out.push(`焦段：${a.lens}mm → ${b.lens}mm`);
  if (Math.abs(a.camH - b.camH) >= 0.25) out.push(`机位高度：${a.camH} 米 → ${b.camH} 米`);
  if (a.view !== b.view) out.push(`产品朝向：${a.view || "未摆"} → ${b.view || "未摆"}`);
  if (opString(parseOp(a.operator)) !== opString(parseOp(b.operator))) out.push(`拍摄者入镜：${opLabel(a.operator)} → ${opLabel(b.operator)}`);
  if (a.block && b.block && a.block !== b.block && !out.length) out.push("3D 摆位改过（产品 / 人偶的位置、姿态或机位），文字里写的位置和动作可能对不上");
  return out;
}

const THEME_WORDS: Record<string, RegExp> = {
  christmas: /christmas|xmas|圣诞/i,
  cny: /lunar new year|chinese new year|春节|新年/i,
  halloween: /halloween|万圣/i,
  thanksgiving: /thanksgiving|感恩节/i,
  birthday: /birthday|生日/i,
  easter: /easter|复活节/i,
};
const INDOOR = /living room|bedroom|\brug\b|carpet|couch|sofa|客厅|卧室|地毯|沙发/i;
const OUTDOOR = /driveway|garage|lawn|sidewalk|\bpark\b|backyard|车道|车库|草坪|公园|人行道|后院/i;
const DAD = /\b(dad|daddy|father)\b|爸爸/i;
const ADULT = /\b(dad|daddy|father|mom|mommy|mother|parent|grandma|grandpa|adult|uncle|aunt|woman|man|lady|guy)\b|爸爸|妈妈|大人|爷爷|奶奶|家长|女人|男人/i;
const KID = /\b(boy|girl|kid|child|toddler|son|daughter)\b|男孩|女孩|孩子|小孩|儿子|女儿/i;

/** 去掉否定说法（no dad / 不要爸爸），免得“画面里不要爸爸”被当成提到了爸爸 */
/** 去掉写拿手机的人的句子（爸爸蹲着用手机拍 / Dad filming）：拍摄者不是 3D 里的人偶 */
export const stripFilmer = (t: string) =>
  t.split(/(?<=[。；;.!?！？])|[，,]/).filter((c) => !/用手机拍|拿着?手机|手机拍|手机后面|镜头后面|在拍|拍摄者|拿手机的人|['’]s shadow|\bfilm(?:s|ing)\b|holding the phone|behind the (?:phone|camera)|person filming/i.test(c)).join("，");

export const stripNeg = (t: string) => t.replace(/\b(no|without|never|not)\b[^.;!?]*/gi, " ").replace(/(不要|没有|不出现|不能有|别让|看不到|看不见)[^，。；,.;]*/g, " ");

/** 文字和 3D 对不上的地方（只查明确的冲突，免费，不调 AI） */
export function shotChecks(s: ShortShot, b: ShotBasis): string[] {
  const l: SetLayout | null = s.layout;
  if (!l) return [];
  const all = [s.description, s.camera, s.productNote, s.framePrompt, s.motionPrompt].join("\n");
  const text = stripFilmer(stripNeg(all));
  const cam = [s.camera, s.framePrompt.split(/[.。]/)[0] ?? ""].join("\n");
  const out: string[] = [];
  const figs = figuresOf(l);
  const adults = figs.filter((f) => f.kind === "adult").length;
  const kids = figs.length - adults;
  if (DAD.test(text) && adults === 0) out.push("文字里有爸爸，3D 里没有大人人偶：要么删掉爸爸，要么在摆放界面加一个大人");
  // 按名字写的大人（Maya crouches…）也算写了
  const named = figs.some((f) => f.kind === "adult" && !!f.memberId && /^[a-z][a-z-]{1,20}$/i.test(f.memberId) && new RegExp(`\\b${f.memberId}\\b`, "i").test(text));
  if (adults > 0 && !ADULT.test(text) && !named) out.push(`3D 里有 ${adults} 个大人人偶，文字里没写是谁、在做什么`);
  if (kids === 0 && KID.test(text)) out.push("文字里有孩子，3D 里没有小孩人偶");
  if (b.scene) {
    const m = b.outdoor ? text.match(INDOOR) : text.match(OUTDOOR);
    if (m) out.push(`场地是「${b.sceneName}」（${b.outdoor ? "室外" : "室内"}），文字里还写着「${m[0]}」`);
  }
  for (const m of cam.matchAll(/(\d{2,3})\s?mm/gi)) {
    if (Math.abs(Number(m[1]) - b.lens) > 8) {
      out.push(`文字写 ${m[1]}mm，3D 机位是 ${b.lens}mm`);
      break;
    }
  }
  for (const m of cam.matchAll(/离地(?:约|大约)?\s*([\d.]+)\s*米|([\d.]+)\s*m (?:above|off) the (?:floor|ground)/gi)) {
    const h = Number(m[1] ?? m[2]);
    if (Number.isFinite(h) && Math.abs(h - b.camH) > 0.35) {
      out.push(`文字写离地 ${h} 米，3D 机位离地 ${b.camH} 米`);
      break;
    }
  }
  if (b.camH >= 1.1 && /crouch|kneel|squat|low on the floor|floor level|蹲|跪/i.test(cam)) out.push(`文字写蹲着 / 贴地拍，3D 机位离地 ${b.camH} 米，像站着拍`);
  if (b.camH < 0.8 && /\bstanding\b|站着|站在/i.test(cam)) out.push(`文字写站着拍，3D 机位只离地 ${b.camH} 米，像蹲着拍`);
  const pv = productView(l);
  if (pv) {
    if ((pv.kind === "head" || pv.kind === "rear") && /three-quarter|3\/4|side profile|侧前方|左前方|右前方/i.test(stripNeg(cam + "\n" + s.productNote))) out.push(`文字写侧面 / 3/4 角度，3D 是${VIEW_LABEL[pv.kind]}`);
    // “正对镜头斜前方”这类写法同时写了 3/4，按 3/4 算，不报
    if (pv.kind !== "head" && /head-on|正对镜头/i.test(text) && !(pv.kind === "front34" && /three-quarter|3\/4|斜前方|侧前方/i.test(text))) out.push(`文字写车头正对镜头，3D 是${VIEW_LABEL[pv.kind]}`);
    if ((pv.kind === "head" || pv.kind === "rear") && /(KRIDDO|字标|logo)[^。.;；]{0,16}(可见|看得到|看得见|visible)/i.test(text)) out.push(`文字写能看到车架侧面的 KRIDDO 字标，3D 是${VIEW_LABEL[pv.kind]}，看不到侧面`);
  }
  const op = parseOp(b.operator);
  if (opMissing(b.operator)) out.push(opMissing(b.operator));
  if (!op.custom) {
    const p = poseOf(op.pose);
    if (b.camH < p.lo || b.camH > p.hi) out.push(`拍摄者是「${p.label}拍」，3D 机位离地 ${b.camH} 米（${p.label}拍一般 ${p.lo}–${p.hi} 米）`);
    if (!operatorView(op.pose, l).parts.includes("toe") && /slipper|拖鞋|their own feet|自己的脚/i.test(stripNeg(text))) out.push(`文字写了拍摄者的脚 / 拖鞋，按「${p.label}拍」和这个机位拍不到`);
  }
  const th = b.theme.startsWith("custom:") ? "" : b.theme;
  if (th && th !== "none" && THEME_WORDS[th] && !THEME_WORDS[th].test(all)) out.push(`主题是${findTheme(th).label}，文字和提示词里没提到`);
  if (th === "none") {
    const hit = Object.entries(THEME_WORDS).find(([, re]) => re.test(text));
    if (hit) out.push(`主题是无节日，文字里还写着${findTheme(hit[0]).label}`);
  }
  return out;
}

export function shotSync(s: ShortShot, place: Place | null): ShotSync {
  const now = basisOf(s, place);
  // 出图时人、位置、动作、机位都从 3D 现读，3D 改过不算文字过期；只报文字里明确和 3D 打架的话
  return { tracked: !!s.textBasis, changes: [], issues: shotChecks(s, now) };
}

export const TEXT_FIELDS = ["description", "camera", "productNote", "framePrompt", "motionPrompt"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];
export const TEXT_LABELS: Record<TextField, string> = { description: "画面", camera: "机位", productNote: "产品备注", framePrompt: "首帧提示词", motionPrompt: "运动提示词" };
