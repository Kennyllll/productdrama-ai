// 本地合成（TASK-008）：用 ffmpeg-static 把镜头素材 / 占位画面按分镜裁剪、统一规格并拼接。仅服务端。
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { UPLOAD_DIR } from "@/lib/db";
import { mediaPath, type ShotMedia } from "@/lib/media-repo";
import type { EpisodeNumber, LocalShot, LocalStoryboard, VisualSpec } from "@/lib/types";

const run = promisify(execFile);

export class RenderError extends Error {}

const FONT = ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc"].find((f) => fs.existsSync(f)) ?? null;

export const FRAME_SIZES: Record<VisualSpec["aspectRatio"], [number, number]> = {
  "2.39:1": [1920, 804],
  "1.85:1": [1920, 1038],
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
};

export const RENDER_NAMES = ["ep1.mp4", "ep2.mp4", "ep3.mp4", "ep4.mp4", "full.mp4"] as const;
export type RenderName = (typeof RENDER_NAMES)[number];

export interface RenderInfo {
  name: RenderName;
  size: number;
  updatedAt: string;
}

export const renderDir = (projectId: string) => path.join(UPLOAD_DIR, projectId, "renders");

export function listRenders(projectId: string): RenderInfo[] {
  return RENDER_NAMES.flatMap((name) => {
    try {
      const st = fs.statSync(path.join(renderDir(projectId), name));
      return [{ name, size: st.size, updatedAt: st.mtime.toISOString() }];
    } catch {
      return [];
    }
  });
}

async function ff(args: string[]) {
  if (!ffmpegPath) throw new RenderError("找不到 FFmpeg，请重新运行 npm install");
  try {
    await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr?.trim().split("\n").pop() ?? "";
    throw new RenderError(`FFmpeg 合成失败${stderr ? `：${stderr.slice(0, 200)}` : ""}`);
  }
}

/** 中文按 2 个单位、其他字符按 1 个单位折行 */
function wrap(text: string, units: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  let w = 0;
  for (const ch of text.replace(/\s+/g, " ").trim()) {
    const cw = /[\u2e80-\uffff]/.test(ch) ? 2 : 1;
    if (w + cw > units && !/[，。！？、；：”）》,.!?;:)]/.test(ch)) {
      lines.push(line);
      line = "";
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, -1)}…`] : lines;
}

/** 分镜台词「Leo: line / Dad: line」→ 去掉说话人的字幕行 */
export function subtitleLines(dialogue: string): string[] {
  return dialogue
    .split(/\n| \/ /)
    .map((l) => l.replace(/^[^:：]{1,30}[:：]\s*/, "").trim())
    .filter(Boolean);
}

function drawtext(textFile: string, opts: string): string {
  const font = FONT ? `fontfile='${FONT}':` : "";
  return `drawtext=${font}textfile='${textFile}':expansion=none:fontcolor=white:${opts}`;
}

async function renderShot(
  shot: LocalShot,
  media: ShotMedia | undefined,
  o: { W: number; H: number; fps: number; ep: number; count: number; subtitles: boolean; dir: string },
): Promise<string> {
  const { W, H, fps } = o;
  const d = shot.seconds;
  const out = path.join(o.dir, `s${String(shot.index).padStart(2, "0")}.mp4`);
  const base = Math.round(Math.min(W, H) * 0.045);
  const input: string[] = [];
  const vf: string[] = [];

  if (media && fs.existsSync(mediaPath(media))) {
    if (media.kind === "video") input.push("-i", mediaPath(media));
    else input.push("-loop", "1", "-framerate", String(fps), "-i", mediaPath(media));
    vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${fps}`);
    if (media.kind === "video") vf.push(`tpad=stop_mode=clone:stop_duration=${d}`);
  } else {
    input.push("-f", "lavfi", "-i", `color=c=0x141414:s=${W}x${H}:r=${fps}`);
    const units = Math.floor(((W - 240) / (base / 2)) * 0.95);
    const text = [
      `占位画面 · 第 ${o.ep} 集 · 镜头 ${shot.index} / ${o.count} · ${d} 秒`,
      `${shot.size} · ${shot.lens}mm · ${shot.angle} · ${shot.camera} · 产品：${shot.product}${shot.hasPetEasterEgg ? " · 彩蛋" : ""}`,
      "",
      ...wrap(shot.description || "（未填写画面描述）", units, 6),
    ].join("\n");
    const file = path.join(o.dir, `t${shot.index}.txt`);
    fs.writeFileSync(file, text);
    vf.push(drawtext(file, `fontsize=${base}:line_spacing=${Math.round(base * 0.45)}:x=120:y=(h-text_h)/2`));
  }
  vf.push("setsar=1");

  if (o.subtitles && shot.dialogue.trim()) {
    const lines = subtitleLines(shot.dialogue);
    if (lines.length) {
      const file = path.join(o.dir, `sub${shot.index}.txt`);
      fs.writeFileSync(file, lines.join("\n"));
      const size = Math.round(Math.min(W, H) * 0.05);
      vf.push(drawtext(file, `fontsize=${size}:line_spacing=${Math.round(size * 0.3)}:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-${Math.round(H * 0.07)}`));
    }
  }
  if (shot.transition === "淡出") vf.push(`fade=t=out:st=${Math.max(0, d - 0.6).toFixed(2)}:d=0.6`);
  vf.push("format=yuv420p");

  await ff([...input, "-t", String(d), "-vf", vf.join(","), "-an", "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", out]);
  return out;
}

async function concat(parts: string[], dir: string, target: string) {
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const tmp = `${target}.part.mp4`;
  await ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", tmp]);
  fs.renameSync(tmp, target);
}

const busy = new Set<string>();

async function exclusive<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  if (busy.has(projectId)) throw new RenderError("本项目正在合成中，请等当前任务完成");
  busy.add(projectId);
  try {
    return await fn();
  } finally {
    busy.delete(projectId);
  }
}

export function renderEpisode(projectId: string, board: LocalStoryboard, ep: EpisodeNumber, media: ShotMedia[], subtitles: boolean) {
  return exclusive(projectId, async () => {
    const shots = board.episodes.find((e) => e.number === ep)?.shots ?? [];
    if (shots.length === 0) throw new RenderError("本集还没有镜头");
    const [W, H] = FRAME_SIZES[board.visualSpec.aspectRatio];
    const fps = board.visualSpec.fps;
    const dir = renderDir(projectId);
    const tmp = path.join(dir, `tmp-ep${ep}-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const parts: string[] = [];
      for (const shot of shots) {
        parts.push(await renderShot(shot, media.find((m) => m.shotId === shot.id), { W, H, fps, ep, count: shots.length, subtitles, dir: tmp }));
      }
      await concat(parts, tmp, path.join(dir, `ep${ep}.mp4`));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

export function renderFull(projectId: string) {
  return exclusive(projectId, async () => {
    const dir = renderDir(projectId);
    const parts = [1, 2, 3, 4].map((n) => path.join(dir, `ep${n}.mp4`));
    if (parts.some((p) => !fs.existsSync(p))) throw new RenderError("请先合成全部四集");
    const tmp = path.join(dir, `tmp-full-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      await concat(parts, tmp, path.join(dir, "full.mp4"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
