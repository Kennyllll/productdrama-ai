import { detectMediaType, MAX_MEDIA_BYTES, setShotMedia, SHOT_ID_RE, toView } from "@/lib/media-repo";
import { findLocalProject } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
  const { id, shotId } = await params;
  if (!findLocalProject(id)) return fail("项目不存在或为示例项目", 404);
  if (!SHOT_ID_RE.test(shotId) || !getStoryboard(id)?.episodes.some((e) => e.shots.some((s) => s.id === shotId))) {
    return fail("镜头不存在，请刷新页面", 404);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("请求格式错误或文件过大", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("未选择文件", 400);
  if (file.size > MAX_MEDIA_BYTES) return fail("文件超过 300 MB", 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectMediaType(bytes);
  if (!type) return fail("仅支持 MP4 / MOV / WebM 视频或 PNG / JPG / WebP 图片", 400);

  const media = setShotMedia({ projectId: id, shotId, originalName: file.name.slice(0, 200), bytes, ...type });
  return Response.json({ media: toView(media) });
}
