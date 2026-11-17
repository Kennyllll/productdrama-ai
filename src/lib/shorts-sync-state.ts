// 服务端：按场地库算每镜的文字同步状态
import { videoTheme, type ShortShot, type ShortVideo } from "@/lib/shorts";
import { listShortVideos } from "@/lib/shorts-repo";
import { ensureScenes, getScene, legacyShotScene } from "@/lib/shorts-scenes-repo";
import { shotSync, type Place, type ShotSync } from "@/lib/shorts-sync";

export function placeOf(v: ShortVideo, s: ShortShot): Place | null {
  const sh = s.scene ?? legacyShotScene(ensureScenes(v.projectId, listShortVideos(v.projectId)), v.room, videoTheme(v).theme);
  const sc = getScene(sh.id);
  return sc ? { name: sc.name, outdoor: sc.outdoor, sh } : null;
}

/** 已采用的镜头不再检查 */
export function syncOf(v: ShortVideo): Record<string, ShotSync> {
  return Object.fromEntries(v.shots.filter((s) => s.stage !== "accepted").map((s) => [s.id, shotSync(s, placeOf(v, s))]));
}
