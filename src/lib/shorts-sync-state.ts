// 服务端：按场地库算每镜的文字同步状态
import { videoTheme, type ShortShot, type ShortVideo } from "@/lib/shorts";
import { listShortVideos } from "@/lib/shorts-repo";
import { ensureScenes, getScene, legacyShotScene } from "@/lib/shorts-scenes-repo";
import { shotSync, type Place, type ShotSync } from "@/lib/shorts-sync";
import { promptConflicts } from "@/lib/shorts-conflicts";
import { getProductModel } from "@/lib/model-repo";
import { getRig } from "@/lib/product-rig-repo";
import { KB002_RIG } from "@/lib/figures";

export function placeOf(v: ShortVideo, s: ShortShot): Place | null {
  const sh = s.scene ?? legacyShotScene(ensureScenes(v.projectId, listShortVideos(v.projectId)), v.room, videoTheme(v).theme);
  const sc = getScene(sh.id);
  return sc ? { name: sc.name, outdoor: sc.outdoor, sh } : null;
}

export function rigOf(v: ShortVideo) {
  const m = getProductModel(v.projectId);
  return (m && getRig(m.id)) || KB002_RIG;
}

/** 卡片和生成前自查用同一套：同步检查 + 人偶动作/手脚接触检查 */
export function fullSync(v: ShortVideo, s: ShortShot, rig = rigOf(v)): ShotSync {
  const sy = shotSync(s, placeOf(v, s));
  const own = promptConflicts(s, rig).filter((c) => !sy.issues.includes(c.msg));
  const fix3d = own.filter((c) => c.fix === "3d").map((c) => ({ msg: c.msg, fig: c.fig }));
  return { ...sy, issues: [...sy.issues, ...own.filter((c) => c.fix !== "3d").map((c) => c.msg)], ...(fix3d.length ? { fix3d } : {}) };
}

/** 已采用的镜头不再检查 */
export function syncOf(v: ShortVideo): Record<string, ShotSync> {
  const rig = rigOf(v);
  return Object.fromEntries(v.shots.filter((s) => s.stage !== "accepted").map((s) => [s.id, fullSync(v, s, rig)]));
}
