import { addProductModel, isGlb, MAX_MODEL_BYTES, stepKey } from "@/lib/model-repo";
import { cadToolsReady, isStep, NEED_CAD_TOOLS, stepLengthCm, stepToGlb } from "@/lib/step-import";
import { putFile } from "@/lib/storage";
import { findLocalProject } from "@/lib/repo";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

/** 上传产品 3D 模型：GLB（带材质，直接用）或工厂 STEP（本机转成 GLB，先审核）。每个项目只保留最新一个。 */
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
  if (isStep(bytes)) {
    if (!cadToolsReady()) return Response.json({ error: NEED_CAD_TOOLS, needTools: true }, { status: 409 });
    try {
      const { glb, info } = await stepToGlb(bytes, "z");
      const model = addProductModel({ projectId: id, originalName: file.name, bytes: glb, status: "review", source: "step", lengthCm: stepLengthCm(info, "z") });
      putFile(stepKey(model), bytes);
      return Response.json({ id: model.id, size: model.size, originalName: model.originalName, step: info, reviewUrl: `/projects/${id}/product/models/${model.id}` });
    } catch (e) {
      return fail(`${file.name}：${e instanceof Error ? e.message : String(e)}`, 400);
    }
  }
  if (!isGlb(bytes)) return fail(`${file.name}：只支持 GLB（材质已内嵌）或工厂 STEP（.step / .stp）`, 400);
  // 规则 #1：只有工厂 CAD 导出的才算精确；照片 / AI 建的 GLB 按近似处理，先审核
  const origin = form.get("origin");
  if (origin !== "factory" && origin !== "ai") return fail("先选这个 GLB 从哪来：工厂 CAD 导出，还是照片 / AI 建的", 400);
  if (origin === "ai") {
    const model = addProductModel({ projectId: id, originalName: file.name, bytes, status: "review", source: "fal" });
    return Response.json({ id: model.id, size: model.size, originalName: model.originalName, reviewUrl: `/projects/${id}/product/models/${model.id}` });
  }
  const model = addProductModel({ projectId: id, originalName: file.name, bytes });
  return Response.json({ id: model.id, size: model.size, originalName: model.originalName });
}
