import { fileResponse } from "@/lib/file-response";
import { getKeyframe, keyframePath } from "@/lib/keyframe-repo";

export async function GET(req: Request, { params }: { params: Promise<{ keyframeId: string }> }) {
  const { keyframeId } = await params;
  const k = getKeyframe(keyframeId);
  if (!k) return new Response("Not found", { status: 404 });
  return fileResponse(req, keyframePath(k), k.mime, { "Content-Security-Policy": "default-src 'none'; sandbox" });
}
