import { fileResponse } from "@/lib/file-response";
import { libraryFilePath } from "@/lib/production-repo";

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const f = libraryFilePath(fileId);
  if (!f) return new Response("Not found", { status: 404 });
  return fileResponse(req, f.filePath, f.mime, { "Content-Security-Policy": "default-src 'none'; sandbox" });
}
