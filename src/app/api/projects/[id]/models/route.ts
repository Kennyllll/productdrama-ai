import { addProductModel, isGlb, MAX_MODEL_BYTES } from "@/lib/model-repo";
import { findLocalProject } from "@/lib/repo";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

/** 上传产品 3D 模型（GLB，带材质）。每个项目只保留最新一个。 */
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
  if (file.size > MAX_MODEL_BYTES) return fail(`${file.name}：超过 ${MAX_MODEL_BYTES / 1024 / 1024} MB`, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isGlb(bytes)) return fail(`${file.name}：仅支持 GLB（glTF 2.0 二进制，材质需已内嵌）`, 400);
  const model = addProductModel({ projectId: id, originalName: file.name, bytes });
  return Response.json({ id: model.id, size: model.size, originalName: model.originalName });
}
