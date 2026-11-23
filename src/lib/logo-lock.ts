// Logo 锁定：视频模型每帧重画 Logo，字母会慢慢变成乱码。
// 服务器后台跟踪 Logo 周围的车身，把首帧（高清）里正确的 Logo 贴回每一帧。免费、不联网。
// Python + OpenCV 在部署 / 第一次启动时装好（scripts/video/setup.mjs），运行时不装；也可以用 PD_VIDEO_PYTHON 指定。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { LogoLockStatus, ShortShot } from "@/lib/shorts";
import { getJob, jobFilePath, videoDir } from "@/lib/shorts-repo";

const win = process.platform === "win32";
const SCRIPT = path.join(process.cwd(), "scripts", "video", "logo_lock.py");
const python = () => process.env.PD_VIDEO_PYTHON || path.join(os.homedir(), ".productdrama", "video-python", win ? "Scripts" : "bin", win ? "python.exe" : "python");

export type LogoBox = [number, number, number, number];
export type LogoLockResult = { status: LogoLockStatus; box?: LogoBox; error?: string };

/** 首帧里找品牌 Logo → 跟踪 → Logo 字母变了才写出 out */
export async function logoLock(video: string, frame: string, brandLogo: string, out: string): Promise<LogoLockResult> {
  if (!fs.existsSync(python())) return { status: "no-tools" };
  const stdout = await new Promise<string>((resolve) =>
    execFile(python(), [SCRIPT, video, frame, brandLogo, out], { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, FFMPEG: ffmpegPath ?? "ffmpeg" } }, (_e, so) => resolve(String(so ?? ""))),
  );
  try {
    const r = JSON.parse(stdout.trim().split("\n").pop() ?? "") as { status: LogoLockStatus; box?: LogoBox; error?: string };
    if (r.status === "locked" && !fs.existsSync(out)) return { status: "error", error: "锁定版视频没写出来" };
    return r;
  } catch {
    return { status: "error", error: "Logo 锁定程序出错" };
  }
}

/** 这一镜实际用的视频文件：自动锁过 Logo（管理员没改回原版）就用锁定版 */
export function shotClipPath(v: { projectId: string; id: string }, s: Pick<ShortShot, "videoJobId" | "logoLock">): string | null {
  const l = s.logoLock;
  if (l && l.status === "locked" && !l.off && l.jobId === s.videoJobId && l.file && /^logo-[a-z0-9-]+\.mp4$/.test(l.file)) {
    const p = path.join(videoDir(v.projectId, v.id), l.file);
    if (fs.existsSync(p)) return p;
  }
  const j = s.videoJobId ? getJob(s.videoJobId) : null;
  return j ? jobFilePath(j) : null;
}
