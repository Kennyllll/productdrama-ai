import { fileResponse } from "@/lib/file-response";
import { getProductModelById, modelPath } from "@/lib/model-repo";

export async function GET(req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const model = getProductModelById(modelId);
  if (!model) return new Response("Not found", { status: 404 });
  return fileResponse(req, modelPath(model), "model/gltf-binary");
}
