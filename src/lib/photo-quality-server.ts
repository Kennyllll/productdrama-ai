import "server-only";
import sharp from "sharp";
import { grayStats, photoWarnings, type PhotoStats } from "@/lib/photo-quality";

const cache = new Map<string, string[]>();

export async function photoStats(file: string): Promise<PhotoStats> {
  const img = sharp(file, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const { data, info } = await img.clone().resize({ width: 512, withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const swap = (meta.orientation ?? 1) >= 5;
  return { width: (swap ? meta.height : meta.width) ?? 0, height: (swap ? meta.width : meta.height) ?? 0, ...grayStats(data, info.width, info.height, info.channels) };
}

/** 照片 id → 提示；文件不变，按 id 缓存。读不了的图不提示（上传时已校验格式） */
export async function photoWarningsFor(photos: { id: string; file: string }[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  await Promise.all(
    photos.map(async (p) => {
      if (!cache.has(p.id)) cache.set(p.id, await photoStats(p.file).then(photoWarnings, () => []));
      const w = cache.get(p.id)!;
      if (w.length) out[p.id] = w;
    }),
  );
  return out;
}
