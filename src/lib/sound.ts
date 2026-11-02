// 声音设计（TASK-010a）：类型选项、清洗与本地规则检查。纯函数，服务端和客户端共用。
import { beatTypeLabel } from "@/lib/mock/demo";
import { EPISODE_SECONDS, newId } from "@/lib/creative";
import type { Beat, EpisodeNumber, SoundCue, SoundLayer, SoundPlan, StemLayer } from "@/lib/types";

export const SOUND_LAYERS: { key: SoundLayer; label: string; color: string }[] = [
  { key: "music", label: "音乐", color: "bg-violet-400/70" },
  { key: "ambience", label: "环境声", color: "bg-sky-400/70" },
  { key: "sfx", label: "音效", color: "bg-amber-400/80" },
  { key: "silence", label: "静音 / 留白", color: "bg-neutral-200/80" },
];

export const STEM_LAYERS: { key: StemLayer; label: string; hint: string }[] = [
  { key: "dialogue", label: "对白 / 配音", hint: "英文台词录音；出现时自动压低音乐" },
  { key: "music", label: "音乐", hint: "配乐分轨，建议从正版曲库或作曲家获取" },
  { key: "ambience", label: "环境声", hint: "雨声、街道、室内底噪等" },
  { key: "sfx", label: "音效", hint: "锁扣、轮子、脚步等，已按镜头对齐" },
];

export const layerLabel = (l: SoundLayer) => SOUND_LAYERS.find((x) => x.key === l)?.label ?? l;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const sec = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(EPISODE_SECONDS, Math.max(0, Math.round(n * 2) / 2)) : fallback;
};

export const blankCue = (startSec = 0): SoundCue => ({
  id: newId(),
  startSec,
  endSec: Math.min(EPISODE_SECONDS, startSec + 5),
  layer: "music",
  description: "",
});

export function sanitizeSoundPlan(input: unknown): SoundPlan | null {
  if (!input || typeof input !== "object") return null;
  const o = rec(input);
  const eps = list(o.episodes);
  return {
    sourceProposalId: str(o.sourceProposalId, 40),
    motif: str(o.motif, 800),
    productSignature: str(o.productSignature, 500),
    mixNote: str(o.mixNote, 800),
    episodes: ([1, 2, 3, 4] as EpisodeNumber[]).map((n, i) => {
      const e = rec(eps.find((x) => rec(x).number === n) ?? eps[i]);
      const cues = list(e.cues)
        .slice(0, 40)
        .map((raw) => {
          const c = rec(raw);
          const startSec = sec(c.startSec, 0);
          return {
            id: typeof c.id === "string" && /^[a-z0-9-]{4,40}$/.test(c.id) ? c.id : newId(),
            startSec,
            endSec: Math.max(startSec, sec(c.endSec, startSec)),
            layer: SOUND_LAYERS.some((l) => l.key === c.layer) ? (c.layer as SoundLayer) : "music",
            description: str(c.description, 500),
          };
        })
        .sort((a, b) => a.startSec - b.startSec);
      return { number: n, direction: str(e.direction, 600), cues };
    }),
  };
}

export function checkSoundEpisode(cues: SoundCue[], beats: Beat[], total: number = EPISODE_SECONDS): string[] {
  if (cues.length === 0) return ["本集还没有声音设计"];
  const warnings: string[] = [];
  cues.forEach((c, i) => {
    if (c.endSec <= c.startSec) warnings.push(`提示 ${i + 1}（${layerLabel(c.layer)}）：结束时间需晚于开始时间`);
    if (c.endSec > total) warnings.push(`提示 ${i + 1}（${layerLabel(c.layer)}）：超出本集时长 ${total} 秒`);
  });
  const music = cues.filter((c) => c.layer === "music");
  if (music.length === 0) warnings.push("本集没有音乐提示");
  const covered = new Set<number>();
  music.forEach((c) => {
    for (let t = Math.floor(c.startSec); t < Math.ceil(c.endSec); t++) covered.add(t);
  });
  if (covered.size >= total - 5) warnings.push(`音乐覆盖约 ${covered.size} 秒，几乎铺满全集，情绪没有起伏`);
  if (!cues.some((c) => c.layer === "silence")) warnings.push("没有留白：建议在转折或最低谷处让音乐抽空");
  const turn = beats.find((b) => b.type === "turn");
  if (turn && !cues.some((c) => c.startSec >= turn.startSec && c.startSec < turn.endSec)) {
    warnings.push(`${beatTypeLabel.turn}节拍（${turn.startSec}–${turn.endSec} 秒）没有声音变化`);
  }
  return warnings;
}
