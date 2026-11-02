// 本机文件响应，支持 HTTP Range（视频拖动进度需要）。
import fs from "node:fs";
import { Readable } from "node:stream";

const toWeb = (s: fs.ReadStream) => Readable.toWeb(s) as unknown as ReadableStream;

export function fileResponse(req: Request, filePath: string, mime: string, extra: Record<string, string> = {}): Response {
  let size: number;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
  const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(toWeb(fs.createReadStream(filePath, { start, end })), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(toWeb(fs.createReadStream(filePath)), { headers: { ...headers, "Content-Length": String(size) } });
}
