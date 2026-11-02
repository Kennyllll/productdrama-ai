import { fileResponse } from "@/lib/file-response";
import { deleteStem, getStem, setStemVolume, stemPath, toStemView } from "@/lib/sound-repo";

export async function GET(req: Request, { params }: { params: Promise<{ stemId: string }> }) {
  const { stemId } = await params;
  const stem = getStem(stemId);
  if (!stem) return new Response("Not found", { status: 404 });
  return fileResponse(req, stemPath(stem), stem.mime, { "Content-Security-Policy": "default-src 'none'; sandbox" });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ stemId: string }> }) {
  const { stemId } = await params;
  if (!getStem(stemId)) return Response.json({ error: "分轨不存在" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { volumeDb?: unknown } | null;
  const v = Number(body?.volumeDb);
  if (!Number.isFinite(v)) return Response.json({ error: "音量无效" }, { status: 400 });
  const stem = setStemVolume(stemId, v);
  return stem ? Response.json({ stem: toStemView(stem) }) : Response.json({ error: "分轨不存在" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ stemId: string }> }) {
  const { stemId } = await params;
  return new Response(null, { status: deleteStem(stemId) ? 204 : 404 });
}
