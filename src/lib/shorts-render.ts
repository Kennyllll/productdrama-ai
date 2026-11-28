// 产品短视频成片：把已采用的镜头按顺序裁剪成 1080×1920 后拼接；字幕开着时开头按 Hook 效果、正文同款样式烧字幕（assets/fonts 里的开源字体）。仅服务端。
import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { bodyAss, hookAss } from "@/lib/hook-effects";
import { hasClip, hookEffectOf, hookParts, hooksOf, shotCuts, shotSound, type ShortShot, type ShortVideo } from "@/lib/shorts";
import { assetPath, listAssets } from "@/lib/repo";
import { finalPath, videoDir } from "@/lib/shorts-repo";
import { shotClipPath } from "@/lib/logo-lock";
import { handheldFilters } from "@/lib/handheld";

const run = promisify(execFile);
const FONTS = path.join(process.cwd(), "assets", "fonts");

/** 截取视频最后一帧（下一镜的连续性参考） */
export async function lastFrame(src: string, out: string): Promise<string> {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg");
  if (fs.existsSync(out)) return out;
  // 锁 Logo 等重新合成的视频，画面轨可能比文件时长短，-sseof -0.15 取不到帧；
  // 退到最后 1 秒逐帧覆盖写，留下的就是最后一帧
  await run(ffmpegPath, ["-y", "-sseof", "-0.15", "-i", src, "-frames:v", "1", "-update", "1", out], { maxBuffer: 1 << 24 });
  if (!fs.existsSync(out)) await run(ffmpegPath, ["-y", "-sseof", "-1", "-i", src, "-update", "1", out], { maxBuffer: 1 << 24 });
  if (!fs.existsSync(out)) throw new Error("取不到上一镜视频的最后一帧，视频文件可能坏了");
  return out;
}

/** 视频文件里有没有声音轨（ffmpeg -i 不给输出会报错退出，信息在 stderr） */
async function hasAudio(src: string): Promise<boolean> {
  try {
    await run(ffmpegPath!, ["-hide_banner", "-i", src], { maxBuffer: 1 << 24 });
  } catch (e) {
    return /Stream #\d+:\d+.*Audio:/.test(String((e as { stderr?: string }).stderr ?? ""));
  }
  return false;
}

/** ffmpeg 滤镜参数里的路径：单引号包起来，路径里的单引号和反斜杠转义 */
const fpath = (p: string) => `'${p.replace(/\\/g, "/").replace(/'/g, "'\\\\''").replace(/:/g, "\\:")}'`;

/** 产品资料里上传的品牌 Logo（PNG / JPG） */
export function brandLogoPath(projectId: string): string | null {
  const a = listAssets(projectId).find((x) => x.kind === "logo" && x.mime !== "image/svg+xml" && fs.existsSync(assetPath(x)));
  return a ? assetPath(a) : null;
}

/** Logo 片尾画面：白底，Logo 居中偏上（字幕在下面） */
const END_BG = "color=c=white:s=1080x1920:r=30";
const endOverlay = "[1:v]scale=640:-1[l];[0:v][l]overlay=(W-w)/2:(H-h)/2-200";

export const endCardStillPath = (v: { projectId: string; id: string }) => path.join(videoDir(v.projectId, v.id), "endcard.png");

/** 片尾预览图（工作台显示用） */
export async function endCardStill(v: ShortVideo): Promise<string> {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg");
  const logo = brandLogoPath(v.projectId);
  if (!logo) throw new Error("还没有品牌 Logo：先到产品资料上传 Logo（PNG 或 JPG）");
  const out = endCardStillPath(v);
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", END_BG, "-i", logo, "-filter_complex", endOverlay, "-frames:v", "1", "-update", "1", out], { maxBuffer: 1 << 24 });
  return out;
}

/** 所选开头 + 已采用的正文按顺序拼接；hookId 为空用第一个开头 */
export async function renderShort(v: ShortVideo, dest = finalPath(v), hookId?: string): Promise<string> {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg");
  const hooks = hooksOf(v);
  const hook = hookId ? hooks.find((s) => s.id === hookId) : hooks[0];
  if (hookId && !hook) throw new Error("这个开头不存在");
  if (hookId && hook && hook.stage !== "accepted") throw new Error(`开头「${hook.hook?.name}」还没采用`);
  const parts = hook ? hookParts(v, hook) : [];
  if (hookId && parts.some((p) => p.stage !== "accepted")) throw new Error(`开头「${hook?.hook?.name}」切镜后的第二段还没采用`);
  const shots = [...parts, ...v.shots.filter((s) => !s.hook)].filter((s): s is ShortShot => !!s && s.stage === "accepted" && hasClip(s));
  // 字幕效果跟着开头走，跨切镜的两段连着放
  const inHook = new Set(parts.map((p) => p.id));
  const hookLen = parts.reduce((a, p) => a + p.useSeconds, 0);
  let hookT = 0;
  if (!shots.length) throw new Error("还没有已采用的镜头");
  const work = path.join(videoDir(v.projectId, v.id), `render-${hook?.id ?? "main"}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const segs: string[] = [];
  for (const [i, s] of shots.entries()) {
    if (s.endCard) {
      const logo = brandLogoPath(v.projectId);
      if (!logo) throw new Error("Logo 片尾要用品牌 Logo：先到产品资料上传 Logo（PNG 或 JPG）");
      const len = s.useSeconds;
      const ass = v.captions === false ? null : bodyAss(hookEffectOf(hook?.hook), s.caption, len, 0);
      const fx = [endOverlay];
      if (ass) {
        const f = path.join(work, `seg${i}.ass`);
        fs.writeFileSync(f, ass);
        fx.push(`subtitles=${fpath(f)}:fontsdir=${fpath(FONTS)}`);
      }
      const out = path.join(work, `seg${i}.mp4`);
      await run(
        ffmpegPath,
        ["-y", "-f", "lavfi", "-t", String(len), "-i", END_BG, "-i", logo, "-f", "lavfi", "-t", String(len), "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", `${fx.join(",")},setsar=1,fps=30[v]`, "-map", "[v]", "-map", "2:a:0", "-t", String(len), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", out],
        { maxBuffer: 1 << 24 },
      );
      segs.push(out);
      continue;
    }
    const src = shotClipPath(v, s);
    if (!src || !fs.existsSync(src)) throw new Error(`镜头 ${i + 1} 的视频文件不存在`);
    // 声音关了的镜头用静音；开了但视频本身没声音（关着声音生成的）也用静音
    const sound = v.exportSound !== false && shotSound(v, s) && (await hasAudio(src));
    let at = 0;
    for (const [k, c] of shotCuts(s).entries()) {
      const zoom = c.zoom > 1 ? [`scale=${Math.round(1080 * c.zoom / 2) * 2}:${Math.round(1920 * c.zoom / 2) * 2}`, "crop=1080:1920"] : [];
      const move = s.layout?.move;
      const shake = move?.kind === "handheld" ? handheldFilters(`${s.id}-${k}`, move.amount) : [];
      const vf = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", ...zoom, ...shake, "setsar=1", "fps=30"];
      const fx = hookEffectOf(hook?.hook);
      const ass = v.captions === false ? null : inHook.has(s.id) ? (fx && hook ? hookAss(fx, hook.caption, hookLen, hookT + at, { line: hook.hook?.line, cut: parts[0]?.useSeconds }) : null) : bodyAss(fx, s.caption, s.useSeconds, at);
      if (ass) {
        const f = path.join(work, `seg${i}-${k}.ass`);
        fs.writeFileSync(f, ass);
        vf.push(`subtitles=${fpath(f)}:fontsdir=${fpath(FONTS)}`);
      }
      at += c.len;
      const out = path.join(work, `seg${i}-${k}.mp4`);
      await run(
        ffmpegPath,
        ["-y", "-ss", String(c.start), "-t", String(c.len), "-i", src, "-f", "lavfi", "-t", String(c.len), "-i", "anullsrc=r=48000:cl=stereo", "-vf", vf.join(","), "-map", "0:v:0", "-map", sound ? "0:a:0" : "1:a:0", ...(sound ? ["-af", `afade=t=out:st=${Math.max(0, c.len - 0.2).toFixed(2)}:d=0.2`] : []), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-shortest", out],
        { maxBuffer: 1 << 24 },
      );
      segs.push(out);
    }
    if (inHook.has(s.id)) hookT += s.useSeconds;
  }
  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, segs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await run(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", dest], { maxBuffer: 1 << 24 });
  fs.rmSync(work, { recursive: true, force: true });
  return dest;
}
