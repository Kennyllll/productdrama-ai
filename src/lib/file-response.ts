// 本机文件响应，支持 HTTP Range（视频拖动进度需要）。
import fs from "node:fs";

/** 浏览器拖动或切换视频时会中途取消请求；这里收到取消就关掉文件，不再往已关闭的流里写 */
function toWeb(s: fs.ReadStream): ReadableStream<Uint8Array> {
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      s.on("data", (chunk) => {
        if (closed) return;
        controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) s.pause();
      });
      s.on("end", () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      s.on("error", (e) => {
        if (closed) return;
        closed = true;
        controller.error(e);
      });
    },
    pull() {
      s.resume();
    },
    cancel() {
      closed = true;
      s.destroy();
    },
  });
}

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
