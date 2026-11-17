// 产品短视频成片：把已采用的镜头按顺序裁剪成 1080×1920 后拼接；不烧字幕（字幕在后期加）。仅服务端。
import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { shotCuts, type ShortShot, type ShortVideo } from "@/lib/shorts";
import { finalPath, getJob, jobFilePath, videoDir } from "@/lib/shorts-repo";

const run = promisify(execFile);

/** 截取视频最后一帧（下一镜的连续性参考） */
export async function lastFrame(src: string, out: string): Promise<string> {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg");
  if (!fs.existsSync(out)) await run(ffmpegPath, ["-y", "-sseof", "-0.15", "-i", src, "-frames:v", "1", "-update", "1", out], { maxBuffer: 1 << 24 });
  return out;
}

/** 所选开头 + 已采用的正文按顺序拼接；hookId 为空用第一个开头 */
export async function renderShort(v: ShortVideo, dest = finalPath(v), hookId?: string): Promise<string> {
  if (!ffmpegPath) throw new Error("找不到 ffmpeg");
  const hooks = v.shots.filter((s) => s.hook);
  const hook = hookId ? hooks.find((s) => s.id === hookId) : hooks[0];
  if (hookId && !hook) throw new Error("这个开头不存在");
  if (hookId && hook && hook.stage !== "accepted") throw new Error(`开头「${hook.hook?.name}」还没采用`);
  const shots = [hook, ...v.shots.filter((s) => !s.hook)].filter((s): s is ShortShot => !!s && s.stage === "accepted" && !!s.videoJobId);
  if (!shots.length) throw new Error("还没有已采用的镜头");
  const work = path.join(videoDir(v.projectId, v.id), `render-${hook?.id ?? "main"}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const segs: string[] = [];
  for (const [i, s] of shots.entries()) {
    const j = getJob(s.videoJobId!);
    const src = j && jobFilePath(j);
    if (!src || !fs.existsSync(src)) throw new Error(`镜头 ${i + 1} 的视频文件不存在`);
    for (const [k, c] of shotCuts(s).entries()) {
      const zoom = c.zoom > 1 ? [`scale=${Math.round(1080 * c.zoom / 2) * 2}:${Math.round(1920 * c.zoom / 2) * 2}`, "crop=1080:1920"] : [];
      const vf = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", ...zoom, "setsar=1", "fps=30"];
      const out = path.join(work, `seg${i}-${k}.mp4`);
      await run(ffmpegPath, ["-y", "-ss", String(c.start), "-t", String(c.len), "-i", src, "-vf", vf.join(","), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out], { maxBuffer: 1 << 24 });
      segs.push(out);
    }
  }
  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, segs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await run(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", dest], { maxBuffer: 1 << 24 });
  fs.rmSync(work, { recursive: true, force: true });
  return dest;
}
