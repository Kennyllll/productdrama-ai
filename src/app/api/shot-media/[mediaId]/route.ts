import { fileResponse } from "@/lib/file-response";
import { deleteShotMedia, getShotMedia, mediaPath } from "@/lib/media-repo";

export async function GET(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const media = getShotMedia(mediaId);
  if (!media) return new Response("Not found", { status: 404 });
  return fileResponse(req, mediaPath(media), media.mime, { "Content-Security-Policy": "default-src 'none'; sandbox" });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  return new Response(null, { status: deleteShotMedia(mediaId) ? 204 : 404 });
}
