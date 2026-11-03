import { deleteProductModel } from "@/lib/model-repo";

export async function DELETE(_req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  return new Response(null, { status: deleteProductModel(modelId) ? 204 : 404 });
}
