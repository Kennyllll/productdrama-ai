// 服务端：按场地库算每镜的文字同步状态
import { videoTheme, type ShortShot, type ShortVideo } from "@/lib/shorts";
import { captionIssues } from "@/lib/shorts-caption-check";
export { captionIssues };
import { listShortVideos } from "@/lib/shorts-repo";
import { ensureScenes, getScene, legacyShotScene } from "@/lib/shorts-scenes-repo";
import { shotSync, type Place, type ShotSync } from "@/lib/shorts-sync";
import { promptConflicts } from "@/lib/shorts-conflicts";
import { getProductModel } from "@/lib/model-repo";
import { getRig } from "@/lib/product-rig-repo";
import { figuresOf, KB002_RIG } from "@/lib/figures";
import { castOf } from "@/lib/families-repo";
import { roleOf, type MemberRole } from "@/lib/families";
import { stripNeg } from "@/lib/shorts-sync";

const ROLE_RX: [MemberRole, RegExp][] = [
  ["dad", /\b(dad|daddy|father)\b|爸爸|父亲/i],
  ["mom", /\b(mom|mommy|mother)\b|妈妈|母亲/i],
  ["grandma", /\bgrandma\b|奶奶|外婆/i],
  ["grandpa", /\bgrandpa\b|爷爷|外公/i],
];
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 文字里写的人和 3D 里是谁对不上（名字、爸爸妈妈）；自拍：3D 里有没有自拍的人、文字写没写他入镜、脸在画面哪边 */
export function castConflicts(v: ShortVideo, s: ShortShot): string[] {
  const l = s.layout;
  const cast = castOf(v.families, s.family ?? 1);
  if (!l || !cast) return [];
  const text = stripNeg([s.description, s.camera, s.framePrompt, s.motionPrompt].join("\n"));
  const figs = figuresOf(l);
  const inFrame = cast.members.filter((m) => figs.some((f) => f.memberId === m.id));
  const unbound = figs.some((f) => !f.memberId && f.kind === "adult");
  const now = inFrame.map((m) => m.name).join("、") || "没有家庭成员";
  const out: string[] = [...captionIssues(s)];
  for (const m of cast.members)
    if (!inFrame.includes(m) && new RegExp(`\\b${esc(m.name)}\\b`, "i").test(text)) out.push(`文字写了 ${m.name}，3D 里没有 ${m.name}（3D 里是：${now}）`);
  for (const [role, rx] of ROLE_RX)
    if (rx.test(text) && !unbound && !inFrame.some((m) => m.role === role)) out.push(`文字写了${roleOf(role).label}，3D 里没有${roleOf(role).label}（3D 里是：${now}）`);
  if (s.hook?.selfie) {
    const me = figs.find((f) => f.id === "self");
    if (!me) out.push("勾了自拍，3D 里没有自拍的人：在 Hook 面板里取消再勾一次自拍，3D 会自动摆好");
    if (/未入镜|不入镜|not visible|off-camera|unseen/i.test(`${s.description}\n${s.framePrompt}`)) out.push("这是自拍，拿手机的人在画面里，文字却写了「未入镜」");
    if (me && l.camPos && l.lookAt) {
      const fx = l.lookAt[0] - l.camPos[0];
      const fy = l.lookAt[1] - l.camPos[1];
      const px = (l.bike?.[0] ?? 0) + me.dx - l.camPos[0];
      const py = (l.bike?.[1] ?? 0) + me.dy - l.camPos[1];
      const right = fx * py - fy * px < 0;
      const wrong = right ? /(脸|face)[^。.；;]{0,24}(左|left)|(左|left)[^。.；;]{0,6}(前景|foreground)/i : /(脸|face)[^。.；;]{0,24}(右|right)|(右|right)[^。.；;]{0,6}(前景|foreground)/i;
      if (wrong.test(`${s.camera}\n${s.framePrompt}`)) out.push(`自拍的人在 3D 画面${right ? "右" : "左"}边，文字写在${right ? "左" : "右"}边`);
    }
  }
  return out;
}

export function placeOf(v: ShortVideo, s: ShortShot): Place | null {
  const sh = s.scene ?? legacyShotScene(ensureScenes(v.projectId, listShortVideos(v.projectId)), v.room, videoTheme(v).theme);
  const sc = getScene(sh.id);
  return sc ? { name: sc.name, outdoor: sc.outdoor, sh } : null;
}

export function rigOf(v: ShortVideo) {
  const m = getProductModel(v.projectId);
  return (m && getRig(m.id)) || KB002_RIG;
}

/** 卡片和生成前自查用同一套：同步检查 + 人偶动作/手脚接触检查 */
export function fullSync(v: ShortVideo, s: ShortShot, rig = rigOf(v)): ShotSync {
  const sy = shotSync(s, placeOf(v, s));
  const own = promptConflicts(s, rig).filter((c) => !sy.issues.includes(c.msg));
  const fix3d = own.filter((c) => c.fix === "3d").map((c) => ({ msg: c.msg, fig: c.fig }));
  const cast = castConflicts(v, s).filter((m) => !sy.issues.includes(m));
  return { ...sy, issues: [...sy.issues, ...own.filter((c) => c.fix !== "3d").map((c) => c.msg), ...cast], ...(fix3d.length ? { fix3d } : {}) };
}

/** 已采用的镜头不再检查 */
export function syncOf(v: ShortVideo): Record<string, ShotSync> {
  const rig = rigOf(v);
  return Object.fromEntries(v.shots.filter((s) => s.stage !== "accepted").map((s) => [s.id, fullSync(v, s, rig)]));
}
