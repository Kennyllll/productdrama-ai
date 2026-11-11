import { fileResponse } from "@/lib/file-response";
import { deleteProductModel, getProductModelById, modelPath } from "@/lib/model-repo";

export async function GET(req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const model = getProductModelById(modelId);
  if (!model) return new Response("Not found", { status: 404 });
  return fileResponse(req, modelPath(model), "model/gltf-binary");
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return new Response(null, { status: deleteProductModel(modelId) ? 204 : 404 });
}
