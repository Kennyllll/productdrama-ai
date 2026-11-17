import { getColor } from "@/lib/model-repo";
import { addAsset, countAssets, detectImageType, findLocalProject, MAX_FILE_BYTES, MAX_PHOTOS } from "@/lib/repo";
import type { AssetKind } from "@/lib/types";

const KINDS: AssetKind[] = ["product_photo", "logo", "packaging_photo", "white_photo", "sticker", "color_photo"];
/** 白底照和颜色款照每一面只传 1 张（同一面再传会替换） */
const ONE_PER_ANGLE: AssetKind[] = ["logo", "white_photo", "color_photo"];

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

  const kind = KINDS.find((k) => k === form.get("kind"));
  if (!kind) return fail("未知的文件用途", 400);
  const counted = !ONE_PER_ANGLE.includes(kind);
  const angle = String(form.get("angle") ?? "").trim().slice(0, 40);
  const note = String(form.get("note") ?? "").trim().slice(0, 200);
  const colorId = kind === "color_photo" ? String(form.get("colorId") ?? "") : null;
  if (colorId !== null && getColor(colorId)?.projectId !== id) return fail("颜色款不存在", 400);
  if ((kind === "white_photo" || kind === "color_photo" || kind === "sticker") && !angle) return fail(kind === "sticker" ? "请选贴纸贴在哪里" : "请选拍的是哪一面", 400);
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("未选择文件", 400);
  if (ONE_PER_ANGLE.includes(kind) && files.length > 1) return fail(kind === "logo" ? "Logo 只能上传 1 个文件" : "每一面上传 1 张", 400);

  const errors: string[] = [];
  let added = 0;
  let photoCount = counted ? countAssets(id, kind) : 0;

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}：超过 20 MB`);
      continue;
    }
    if (counted && photoCount >= MAX_PHOTOS) {
      errors.push(`${file.name}：${kind === "packaging_photo" ? "包装照片" : kind === "sticker" ? "贴纸" : "产品照片"}最多 ${MAX_PHOTOS} 张`);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type || (type.mime === "image/svg+xml" && kind !== "logo")) {
      errors.push(`${file.name}：仅支持 ${kind === "logo" ? "PNG / JPG / WebP / SVG" : "PNG / JPG / WebP"}`);
      continue;
    }
    addAsset({ projectId: id, kind, angle, note, colorId, originalName: file.name.slice(0, 200), bytes, ...type });
    added++;
    if (counted) photoCount++;
  }

  return Response.json({ added, errors }, { status: added > 0 ? 200 : 400 });
}
