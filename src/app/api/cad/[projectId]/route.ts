import fs from "node:fs/promises";
import path from "node:path";
import { cadDir } from "@/lib/model-repo";
import { findLocalProject } from "@/lib/repo";

/** 读取 CAD 渲染 / 合成的中间文件：/api/cad/<projectId>?f=<shotId>/plate.png */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!findLocalProject(projectId)) return new Response("Not found", { status: 404 });
  const f = new URL(req.url).searchParams.get("f") ?? "";
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?\.(png|jpg)$/i.test(f)) return new Response("Bad request", { status: 400 });
  const file = path.join(cadDir(projectId), f);
  try {
    const bytes = await fs.readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": f.endsWith(".jpg") ? "image/jpeg" : "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
