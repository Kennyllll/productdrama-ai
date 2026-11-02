import { findLocalProject } from "@/lib/repo";
import { STEM_LAYERS } from "@/lib/sound";
import { detectAudioType, MAX_STEM_BYTES, setStem, toStemView } from "@/lib/sound-repo";
import type { EpisodeNumber, StemLayer } from "@/lib/types";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!findLocalProject(id)) return fail("项目不存在或为示例项目", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("请求格式错误或文件过大", 400);
  }
  const episode = Number(form.get("episode"));
  const layer = String(form.get("layer") ?? "");
  if (![1, 2, 3, 4].includes(episode)) return fail("集数无效", 400);
  if (!STEM_LAYERS.some((l) => l.key === layer)) return fail("分轨类型无效", 400);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("未选择文件", 400);
  if (file.size > MAX_STEM_BYTES) return fail("文件超过 200 MB", 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectAudioType(bytes);
  if (!type) return fail("仅支持 WAV / MP3 / M4A / AIFF / FLAC 音频", 400);

  const stem = setStem({ projectId: id, episode: episode as EpisodeNumber, layer: layer as StemLayer, originalName: file.name.slice(0, 200), bytes, ...type });
  return Response.json({ stem: toStemView(stem) });
}
