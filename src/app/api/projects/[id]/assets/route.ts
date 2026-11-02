import { addAsset, countAssets, detectImageType, findLocalProject, MAX_FILE_BYTES, MAX_PHOTOS } from "@/lib/repo";

const fail = (message: string, status: number) => Response.json({ added: 0, errors: [message] }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findLocalProject(id)) return fail("项目不存在或为示例项目", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("请求格式错误", 400);
  }

  const kind = form.get("kind");
  if (kind !== "product_photo" && kind !== "logo") return fail("未知的文件用途", 400);
  const angle = String(form.get("angle") ?? "").trim().slice(0, 40);
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("未选择文件", 400);
  if (kind === "logo" && files.length > 1) return fail("Logo 只能上传 1 个文件", 400);

  const errors: string[] = [];
  let added = 0;
  let photoCount = kind === "product_photo" ? countAssets(id, "product_photo") : 0;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}：超过 20 MB`);
      continue;
    }
    if (kind === "product_photo" && photoCount >= MAX_PHOTOS) {
      errors.push(`${file.name}：产品照片最多 ${MAX_PHOTOS} 张`);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type || (type.mime === "image/svg+xml" && kind !== "logo")) {
      errors.push(`${file.name}：仅支持 ${kind === "logo" ? "PNG / JPG / WebP / SVG" : "PNG / JPG / WebP"}`);
      continue;
    }
    addAsset({ projectId: id, kind, angle, originalName: file.name.slice(0, 200), bytes, ...type });
    added++;
    if (kind === "product_photo") photoCount++;
  }

  return Response.json({ added, errors }, { status: added > 0 ? 200 : 400 });
}
