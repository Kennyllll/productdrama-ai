import { fileResponse } from "@/lib/file-response";
import path from "node:path";
import { finalPath, getJob, getShortVideo, hookFinalPath, jobFilePath, videoDir } from "@/lib/shorts-repo";

/** /api/shorts/<jobId> 取生成结果；/api/shorts/<videoId>?final=1 取成片 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const csp = { "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'" };
  const comp = new URL(req.url).searchParams.get("comp");
  if (comp) {
    const v = getShortVideo(jobId);
    const s = v?.shots.find((x) => x.id === comp);
    if (!v || !s?.compFile || !/^comp-[a-z0-9-]+\.png$/.test(s.compFile)) return new Response("Not found", { status: 404 });
    return fileResponse(req, path.join(videoDir(v.projectId, v.id), s.compFile), "image/png", csp);
  }
  const final = new URL(req.url).searchParams.get("final");
  if (final) {
    const v = getShortVideo(jobId);
    if (!v) return new Response("Not found", { status: 404 });
    if (final === "1") return fileResponse(req, finalPath(v), "video/mp4", csp);
    if (!v.shots.some((s) => s.hook && s.id === final)) return new Response("Not found", { status: 404 });
    return fileResponse(req, hookFinalPath(v, final), "video/mp4", csp);
  }
  const j = getJob(jobId);
  const p = j && jobFilePath(j);
  if (!j || !p || !j.outputMime) return new Response("Not found", { status: 404 });
  return fileResponse(req, p, j.outputMime, csp);
}
