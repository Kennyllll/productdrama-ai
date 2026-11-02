// 分镜生成、清洗与本地规则检查（TASK-005）。纯函数，非 AI。
import { checkEpisodeShots, type CinematicWarning } from "@/lib/cinematic";
import { EPISODE_SECONDS, newId } from "@/lib/creative";
import type {
  BeatType,
  CameraAngle,
  CameraMove,
  CharacterRole,
  EpisodeNumber,
  FilmStyle,
  LensMm,
  LocalScript,
  LocalShot,
  LocalStoryboard,
  ProductPresence,
  ReviewStatus,
  ShotSize,
  Transition,
  VisualSpec,
} from "@/lib/types";

export const cameraMoves: CameraMove[] = ["固定", "推近", "拉远", "横摇", "跟拍", "环绕", "俯拍", "手持"];
export const shotSizes: ShotSize[] = ["大远景", "远景", "全景", "中景", "近景", "特写", "大特写"];
export const lenses: LensMm[] = [18, 24, 35, 50, 85, 100, 135];
export const angles: CameraAngle[] = ["平视", "低机位", "高机位", "俯视", "过肩", "主观视角"];
export const transitions: Transition[] = ["硬切", "匹配剪辑", "叠化", "J-Cut", "L-Cut", "甩镜", "淡出"];
export const presences: ProductPresence[] = ["主体", "背景", "无"];
export const reviewStatuses: ReviewStatus[] = ["pending", "approved", "needs_changes"];
export const aspectRatios: VisualSpec["aspectRatio"][] = ["2.39:1", "1.85:1", "16:9", "9:16"];
export const fpsOptions: VisualSpec["fps"][] = [24, 25, 30];

const BEAT_LABEL: Record<BeatType, string> = { hook: "钩子", conflict: "冲突", turn: "转折", cliffhanger: "悬念", resolution: "收束" };
const LENS_BY_SIZE: Record<ShotSize, LensMm> = { 大远景: 18, 远景: 24, 全景: 35, 中景: 35, 近景: 50, 特写: 85, 大特写: 100 };
const SHOT_SECONDS = 7;

type Pattern = [ShotSize, CameraAngle, CameraMove, ProductPresence, Transition];
const PATTERNS: Record<BeatType, Pattern[]> = {
  hook: [
    ["远景", "平视", "推近", "背景", "硬切"],
    ["近景", "低机位", "固定", "主体", "匹配剪辑"],
  ],
  conflict: [
    ["中景", "过肩", "手持", "背景", "硬切"],
    ["近景", "平视", "跟拍", "无", "J-Cut"],
  ],
  turn: [
    ["特写", "低机位", "环绕", "主体", "硬切"],
    ["全景", "高机位", "拉远", "主体", "叠化"],
  ],
  cliffhanger: [["近景", "主观视角", "推近", "背景", "淡出"]],
  resolution: [["全景", "平视", "拉远", "主体", "淡出"]],
};

const firstClause = (s: string) => s.split("；")[0];

export const reindex = (shots: LocalShot[]) => shots.map((s, i) => ({ ...s, index: i + 1 }));

export function defaultVisualSpec(style: FilmStyle): VisualSpec {
  const aspect = aspectRatios.find((a) => a === style.suggestedAspect) ?? "2.39:1";
  return {
    filmReference: `《${style.film}》（${style.director}）`,
    aspectRatio: aspect,
    fps: 24,
    colorGrade: `参考色板：${style.palette.map((p) => p.name).join(" / ")}；产品区域颜色保护`,
    grain: "35mm 胶片细颗粒",
    lensPackage: "球面定焦 24 / 35 / 50 / 85 / 100mm",
    depthOfField: "浅景深，产品始终在焦内",
  };
}

export function blankShot(style: FilmStyle): LocalShot {
  return {
    id: newId(),
    index: 0,
    seconds: 3,
    description: "",
    camera: "固定",
    characterIds: [],
    dialogue: "",
    product: "无",
    hasPetEasterEgg: false,
    size: "中景",
    lens: 50,
    angle: "平视",
    composition: style.composition,
    lighting: firstClause(style.lighting),
    transition: "硬切",
    sound: "",
    continuity: "",
    productNote: "",
    review: "pending",
  };
}

const splitSeconds = (total: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

/** 按剧本节拍生成模板分镜（非 AI） */
export function buildStoryboard(
  script: LocalScript,
  style: FilmStyle,
  cast: { id: string; role: CharacterRole; episodes: EpisodeNumber[] }[],
  hasEgg: boolean,
): LocalStoryboard {
  return {
    sourceProposalId: script.proposalId,
    visualSpec: defaultVisualSpec(style),
    episodes: script.episodes.map((ep) => {
      const castIds = cast.filter((c) => c.episodes.includes(ep.number) && (c.role === "lead" || c.role === "supporting")).map((c) => c.id);
      const shots: LocalShot[] = [];
      for (const beat of ep.beats) {
        const dur = Math.max(1, beat.endSec - beat.startSec);
        const pattern = PATTERNS[beat.type];
        splitSeconds(dur, Math.max(1, Math.ceil(dur / SHOT_SECONDS))).forEach((seconds, i) => {
          const [size, angle, camera, product, transition] = pattern[i % pattern.length];
          const productOnly = product === "主体" && (size === "特写" || size === "大特写");
          shots.push({
            ...blankShot(style),
            seconds,
            description: `${BEAT_LABEL[beat.type]}：${beat.description.trim() || "（待补充画面）"}`,
            camera,
            characterIds: productOnly ? [] : castIds,
            product,
            size,
            lens: LENS_BY_SIZE[size],
            angle,
            transition,
            productNote: product === "主体" ? firstClause(style.productTreatment) : "",
          });
        });
      }
      const talkShots = shots.filter((s) => !(s.product === "主体" && (s.size === "特写" || s.size === "大特写")));
      ep.scenes
        .flatMap((s) => s.lines)
        .filter((l) => l.text.trim())
        .forEach((l, i) => {
          const s = talkShots[i] ?? shots[shots.length - 1];
          if (!s) return;
          const line = `${l.speaker.trim() || "旁白"}：${l.text.trim()}`;
          s.dialogue = s.dialogue ? `${s.dialogue} / ${line}` : line;
        });
      if (hasEgg && shots.length) (shots.find((s, i) => i > 0 && s.product === "背景") ?? shots[Math.min(1, shots.length - 1)]).hasPetEasterEgg = true;
      if (shots.length) shots[shots.length - 1].transition = "淡出";
      return { number: ep.number, shots: reindex(shots) };
    }),
  };
}

export function checkStoryboardEpisode(shots: LocalShot[], hasEgg: boolean): CinematicWarning[] {
  if (shots.length === 0) return [{ shotIndex: null, message: "本集还没有镜头" }];
  const warnings = checkEpisodeShots(shots, EPISODE_SECONDS);
  if (!shots.some((s) => s.product === "主体")) warnings.push({ shotIndex: null, message: "本集没有产品主体镜头" });
  shots
    .filter((s) => s.product === "主体" && !s.productNote.trim())
    .forEach((s) => warnings.push({ shotIndex: s.index, message: `镜头 ${s.index} 产品为主体，请写明产品出现方式` }));
  const eggShots = shots.filter((s) => s.hasPetEasterEgg);
  if (hasEgg && eggShots.length === 0) warnings.push({ shotIndex: null, message: "已选彩蛋角色，本集还没有安排彩蛋镜头" });
  if (hasEgg && eggShots.length > 1) warnings.push({ shotIndex: null, message: `彩蛋每集建议只出现一次，本集有 ${eggShots.length} 个彩蛋镜头` });
  if (!hasEgg && eggShots.length) warnings.push({ shotIndex: eggShots[0].index, message: "本项目未选彩蛋角色，但有镜头标记了彩蛋" });
  return warnings;
}

const pick = <T,>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function sanitizeShot(raw: unknown, i: number): LocalShot {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof s.id === "string" && /^[a-z0-9-]{4,40}$/.test(s.id) ? s.id : newId(),
    index: i + 1,
    seconds: Math.max(1, Math.min(15, Math.round(Number(s.seconds)) || 1)),
    description: str(s.description, 500),
    camera: pick(s.camera, cameraMoves, "固定"),
    characterIds: Array.isArray(s.characterIds) ? s.characterIds.filter((x): x is string => typeof x === "string").slice(0, 30).map((x) => x.slice(0, 40)) : [],
    dialogue: str(s.dialogue, 500),
    product: pick(s.product, presences, "无"),
    hasPetEasterEgg: s.hasPetEasterEgg === true,
    size: pick(s.size, shotSizes, "中景"),
    lens: pick(s.lens, lenses, 50),
    angle: pick(s.angle, angles, "平视"),
    composition: str(s.composition, 300),
    lighting: str(s.lighting, 300),
    transition: pick(s.transition, transitions, "硬切"),
    sound: str(s.sound, 300),
    continuity: str(s.continuity, 300),
    productNote: str(s.productNote, 500),
    review: pick(s.review, reviewStatuses, "pending"),
  };
}

export function sanitizeStoryboard(input: unknown): LocalStoryboard | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const vs = (o.visualSpec && typeof o.visualSpec === "object" ? o.visualSpec : {}) as Record<string, unknown>;
  const eps: unknown[] = Array.isArray(o.episodes) ? o.episodes : [];
  return {
    sourceProposalId: str(o.sourceProposalId, 40),
    visualSpec: {
      filmReference: str(vs.filmReference, 200),
      aspectRatio: pick(vs.aspectRatio, aspectRatios, "2.39:1"),
      fps: pick(vs.fps, fpsOptions, 24),
      colorGrade: str(vs.colorGrade, 300),
      grain: str(vs.grain, 200),
      lensPackage: str(vs.lensPackage, 200),
      depthOfField: str(vs.depthOfField, 200),
    },
    episodes: ([1, 2, 3, 4] as EpisodeNumber[]).map((n) => {
      const e = eps.find((x) => !!x && typeof x === "object" && (x as { number?: unknown }).number === n) as { shots?: unknown } | undefined;
      const raw: unknown[] = Array.isArray(e?.shots) ? e.shots.slice(0, 20) : [];
      return { number: n, shots: raw.map(sanitizeShot) };
    }),
  };
}
