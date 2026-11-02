import path from "node:path";
import { fileResponse } from "@/lib/file-response";
import { RENDER_NAMES, renderDir, type RenderName } from "@/lib/render";
import { findLocalProject } from "@/lib/repo";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!findLocalProject(id) || !RENDER_NAMES.includes(name as RenderName)) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return fileResponse(req, path.join(renderDir(id), name), "video/mp4", download ? { "Content-Disposition": `attachment; filename="${name}"` } : {});
}
