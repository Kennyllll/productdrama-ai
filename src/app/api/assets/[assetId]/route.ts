import fs from "node:fs/promises";
import { assetPath, deleteAsset, getAsset } from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = getAsset(assetId);
  if (!asset) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(assetPath(asset));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return new Response(null, { status: deleteAsset(assetId) ? 204 : 404 });
}
