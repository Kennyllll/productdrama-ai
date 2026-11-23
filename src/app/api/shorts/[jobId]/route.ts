import { fileResponse } from "@/lib/file-response";
import { shotClipPath } from "@/lib/logo-lock";
import path from "node:path";
import { previewPath } from "@/lib/export-paths";
import { getExportVersion, versionPath } from "@/lib/export-versions-repo";
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
  if (new URL(req.url).searchParams.get("preview") === "1") {
    const v = getShortVideo(jobId);
    if (!v) return new Response("Not found", { status: 404 });
    return fileResponse(req, previewPath(v), "video/mp4", csp);
  }
  const version = new URL(req.url).searchParams.get("version");
  if (version) {
    const ver = getExportVersion(version);
    if (!ver || ver.videoId !== jobId || !/^v\d+-[0-9a-f]{8}\.mp4$/.test(ver.file)) return new Response("Not found", { status: 404 });
    return fileResponse(req, versionPath(ver), "video/mp4", { ...csp, "Content-Disposition": `attachment; filename="export-v${ver.n}.mp4"` });
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
  if (j && !new URL(req.url).searchParams.get("orig")) {
    const v = getShortVideo(j.videoId);
    const s = v?.shots.find((x) => x.videoJobId === jobId && x.logoLock?.jobId === jobId);
    const locked = v && s ? shotClipPath(v, s) : null;
    if (locked && locked !== p) return fileResponse(req, locked, "video/mp4", csp);
  }
  if (!j || !p || !j.outputMime) return new Response("Not found", { status: 404 });
  return fileResponse(req, p, j.outputMime, csp);
}
