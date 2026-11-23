import { randomUUID } from "node:crypto";
import { findLocalProject } from "@/lib/repo";
import { cadToolsReady, isDwg, isDxf, MAX_DXF_BYTES, NEED_CAD_TOOLS, readDxf } from "@/lib/step-import";
import { putFile, storageKey } from "@/lib/storage";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

/** 上传工厂 2D 图纸（DXF）：存原文件，读出尺寸标注和预览图，给校准模型用（免费，本机） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findLocalProject(id)) return fail("项目不存在或为示例项目", 404);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("请求格式错误", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("未选择文件", 400);
  if (file.size > MAX_DXF_BYTES) return fail(`${file.name}：超过 ${MAX_DXF_BYTES / 1024 / 1024} MB`, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (isDwg(bytes)) return fail(`${file.name} 是 DWG：请让工厂（或用 CAD 软件）「另存为 DXF」再传`, 400);
  if (!isDxf(bytes)) return fail(`${file.name}：只支持 DXF 图纸`, 400);
  if (!cadToolsReady()) return Response.json({ error: NEED_CAD_TOOLS, needTools: true }, { status: 409 });
  try {
    const { info, png } = await readDxf(bytes);
    const drawingId = randomUUID();
    putFile(storageKey(id, "drawings", `${drawingId}.dxf`), bytes);
    putFile(storageKey(id, "drawings", `${drawingId}.png`), png);
    const max = (k: string) => Math.max(0, ...info.dims.filter((d) => d.kind === k).map((d) => d.valueMm));
    return Response.json({
      id: drawingId,
      name: file.name,
      png: `data:image/png;base64,${png.toString("base64")}`,
      dims: info.dims,
      extentsMm: info.extentsMm,
      suggest: { lengthMm: max("horizontal") || null, heightMm: max("vertical") || null },
    });
  } catch (e) {
    return fail(`${file.name}：${e instanceof Error ? e.message : String(e)}`, 400);
  }
}
