import { MAX_PHOTOS_PER_OWNER } from "@/lib/cast";
import { addPhoto, countPhotos, getCharacterProject, getEgg, listPhotos, photoDir } from "@/lib/cast-repo";
import { detectImageType, findLocalProject, MAX_FILE_BYTES } from "@/lib/repo";

const fail = (message: string, status: number) => Response.json({ added: 0, errors: [message] }, { status });

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("请求格式错误", 400);
  }

  const owner = form.get("owner");
  const ownerId = String(form.get("ownerId") ?? "");
  let dir: string;
  if (owner === "character") {
    const projectId = getCharacterProject(ownerId);
    if (!projectId || !findLocalProject(projectId)) return fail("角色不存在，请先保存选角", 404);
    dir = photoDir("character", ownerId, projectId);
  } else if (owner === "egg") {
    if (!getEgg(ownerId)) return fail("彩蛋角色不存在", 404);
    dir = photoDir("egg", ownerId);
  } else {
    return fail("未知的上传对象", 400);
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("未选择文件", 400);

  const errors: string[] = [];
  let added = 0;
  let count = countPhotos(owner, ownerId);
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}：超过 20 MB`);
      continue;
    }
    if (count >= MAX_PHOTOS_PER_OWNER) {
      errors.push(`${file.name}：每个角色最多 ${MAX_PHOTOS_PER_OWNER} 张参考照`);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type || type.mime === "image/svg+xml") {
      errors.push(`${file.name}：仅支持 PNG / JPG / WebP`);
      continue;
    }
    addPhoto({ owner, ownerId, dir, originalName: file.name.slice(0, 200), bytes, ...type });
    added++;
    count++;
  }

  return Response.json({ added, errors, photos: listPhotos(owner, ownerId) }, { status: added > 0 ? 200 : 400 });
}
