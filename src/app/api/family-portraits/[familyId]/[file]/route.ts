import fs from "node:fs";
import { fileResponse } from "@/lib/file-response";
import { portraitKey } from "@/lib/families-repo";
import { localPath } from "@/lib/storage";

/** /api/family-portraits/<familyId>/<file> 取家庭库定妆照 */
export async function GET(req: Request, { params }: { params: Promise<{ familyId: string; file: string }> }) {
  const { familyId, file } = await params;
  const m = /^[a-z0-9-]{1,80}\.(png|jpg|webp)$/.exec(file);
  if (!/^[0-9a-f-]{36}$/.test(familyId) || !m) return new Response("Not found", { status: 404 });
  const p = localPath(portraitKey(familyId, file));
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  const mime = m[1] === "jpg" ? "image/jpeg" : `image/${m[1]}`;
  return fileResponse(req, p, mime, { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
}
