import fs from "node:fs/promises";
import { deletePhoto, findPhoto, photoPath } from "@/lib/cast-repo";

export async function GET(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  const photo = findPhoto(photoId);
  if (!photo) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(photoPath(photo));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  return new Response(null, { status: deletePhoto(photoId) ? 204 : 404 });
}
