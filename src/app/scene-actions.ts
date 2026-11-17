"use server";

import { revalidatePath } from "next/cache";
import { AiError, chatJson } from "@/lib/ai/client";
import { findLocalProject } from "@/lib/repo";
import { cleanItems, ITEM_TYPES, visibleChanges, type SceneItem } from "@/lib/shorts-scenes";
import { addVersion, createScene, ensureScenes, getScene, latest, legacyShotScene, themedScene, versionOf } from "@/lib/shorts-scenes-repo";
import { videoTheme } from "@/lib/shorts";
import { getShortVideo, listShortVideos, saveShortVideo } from "@/lib/shorts-repo";
import { cleanRig } from "@/lib/figures";
import { saveRig } from "@/lib/product-rig-repo";

type Result<T> = { error?: string; result?: T };
const fail = (e: unknown) => ({ error: e instanceof AiError || e instanceof Error ? e.message : "操作失败" });
const refresh = (projectId: string, videoId?: string) => {
  revalidatePath(`/projects/${projectId}/shorts`);
  if (videoId) revalidatePath(`/projects/${projectId}/shorts/${videoId}`);
};

function loadVideo(videoId: string) {
  const v = getShortVideo(videoId);
  if (!v || !findLocalProject(v.projectId)) throw new Error("短视频不存在");
  const scenes = ensureScenes(v.projectId, listShortVideos(v.projectId));
  for (const s of v.shots) if (!s.scene) s.scene = legacyShotScene(scenes, v.room, videoTheme(v).theme);
  return { v, scenes };
}

/** 本镜换场地 / 版本 / 家庭 / 特殊要求：只有构图草案能改；换了场地作废本镜 3D 构图。节日跟整条视频走，不在镜头里改 */
export async function setShotSceneAction(
  videoId: string,
  shotId: string,
  patch: { sceneId?: string; v?: number; family?: number; special?: string },
): Promise<Result<true>> {
  try {
    const { v } = loadVideo(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    if (s.stage !== "draft") throw new Error("构图已确认，场地版本已锁定：要换先在工作台点“退回构图”");
    const cur = s.scene!;
    const sc = getScene(patch.sceneId ?? cur.id);
    if (!sc || sc.projectId !== v.projectId) throw new Error("场地不存在");
    const ver = patch.sceneId && patch.sceneId !== cur.id ? latest(sc).v : (patch.v ?? cur.v);
    const next = themedScene(sc, versionOf(sc, ver).v, cur.theme, cur.themeText);
    const geomChanged = next.id !== cur.id || next.v !== cur.v;
    s.scene = next;
    if (patch.family !== undefined) s.family = Math.max(1, Math.min(9, Math.round(patch.family)));
    if (patch.special !== undefined) s.special = patch.special.slice(0, 600);
    if (geomChanged) s.compFile = null;
    saveShortVideo(v);
    refresh(v.projectId, v.id);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** 场地已锁定镜头里看得到、却被改动的物件（存新版本前提醒） */
export async function sceneConflictsAction(sceneId: string, items: SceneItem[]): Promise<Result<string[]>> {
  try {
    const sc = getScene(sceneId);
    if (!sc) throw new Error("场地不存在");
    const clean = cleanItems(items);
    const out: string[] = [];
    for (const v of listShortVideos(sc.projectId)) {
      v.shots.forEach((s, i) => {
        if (!s.scene || s.scene.id !== sc.id || s.stage === "draft" || !s.layout) return;
        out.push(...visibleChanges(versionOf(sc, s.scene.v).items, clean, [{ label: `${v.title} #${i + 1}`, theme: s.scene.theme, cam: s.layout.camPos, look: s.layout.lookAt, lens: s.layout.lens }]));
      });
    }
    return { result: out };
  } catch (e) {
    return fail(e);
  }
}

/** 修改场地：存成新版本；草案镜头（指定的）跟到新版本 */
export async function saveSceneVersionAction(sceneId: string, items: SceneItem[], note: string, meta?: { name?: string; description?: string; special?: string }, moveShot?: { videoId: string; shotId: string }): Promise<Result<number>> {
  try {
    const sc = getScene(sceneId);
    if (!sc || !findLocalProject(sc.projectId)) throw new Error("场地不存在");
    if (meta?.name !== undefined) sc.name = meta.name.slice(0, 40) || sc.name;
    if (meta?.description !== undefined) sc.description = meta.description.slice(0, 400);
    if (meta?.special !== undefined) sc.special = meta.special.slice(0, 600);
    const ver = addVersion(sc, items, note || "手动修改");
    if (moveShot) {
      const { v } = loadVideo(moveShot.videoId);
      const s = v.shots.find((x) => x.id === moveShot.shotId);
      if (s && s.stage === "draft" && s.scene?.id === sc.id) {
        s.scene.v = ver.v;
        s.compFile = null;
        saveShortVideo(v);
      }
    }
    refresh(sc.projectId, moveShot?.videoId);
    return { result: ver.v };
  } catch (e) {
    return fail(e);
  }
}

const TYPES_DOC = ITEM_TYPES.filter((t) => t.id !== "box").map((t) => `${t.id}(${t.label},默认 ${t.size.join("×")}m)`).join("; ");
const SYSTEM = `You lay out 3D blocking sets for short product videos. Coordinates: x east, y north, z up, metres; the product stands at the origin, keep a 2 m clear area around it. Each item: {"type","x","y","z","yaw","w","d","h","rgb":[r,g,b 0-1],"theme"?}. x,y = footprint centre, z = height of the bottom above floor, yaw degrees (0 = width along x; walls along y use yaw 90), w/d/h = real size. Allowed types: ${TYPES_DOC}. Indoor rooms: floor + 3 walls (leave the south side open for the camera), furniture against walls. Use realistic North American home sizes. Holiday decorations get "theme" (christmas, cny, halloween, thanksgiving, birthday, easter or custom). Output json {"name","description","outdoor":bool,"items":[...]} with description in short English.`;

/** 一句话新建场地或修改场地（DeepSeek 文字调用，不调用图像 / 视频接口） */
export async function aiSceneAction(projectId: string, prompt: string, sceneId?: string, v?: number): Promise<Result<{ name: string; description: string; outdoor: boolean; items: SceneItem[] }>> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    if (prompt.trim().length < 2) throw new Error("先写场景描述或要改什么");
    const sc = sceneId ? getScene(sceneId) : null;
    const user = sc
      ? `Current set "${sc.name}" (${sc.description}). Items: ${JSON.stringify(versionOf(sc, v ?? latest(sc).v).items.map(({ id, ...i }) => ({ id, ...i })))}\nChange request (Chinese): ${prompt}\nReturn the full updated item list; keep "id" for unchanged items.`
      : `New set request (Chinese): ${prompt}`;
    const { data } = await chatJson({ system: SYSTEM, user, maxTokens: 8000, thinking: false, timeoutMs: 180_000 });
    const d = data as { name?: string; description?: string; outdoor?: boolean; items?: unknown };
    const items = cleanItems(d?.items);
    if (items.length < 2) throw new AiError("AI 没有返回可用的场地布局，请重试");
    return { result: { name: String(d.name ?? sc?.name ?? "新场地").slice(0, 40), description: String(d.description ?? sc?.description ?? "").slice(0, 400), outdoor: Boolean(d.outdoor ?? sc?.outdoor), items } };
  } catch (e) {
    return fail(e);
  }
}

/** 新建场地（可从 AI 结果或复制现有场地），可选立刻给本镜用 */
export async function createSceneAction(projectId: string, init: { name: string; description: string; special?: string; outdoor: boolean; items: SceneItem[] }, useFor?: { videoId: string; shotId: string }): Promise<Result<string>> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    const sc = createScene(projectId, { ...init, items: cleanItems(init.items) });
    if (useFor) {
      const r = await setShotSceneAction(useFor.videoId, useFor.shotId, { sceneId: sc.id });
      if (r.error) throw new Error(r.error);
    }
    refresh(projectId, useFor?.videoId);
    return { result: sc.id };
  } catch (e) {
    return fail(e);
  }
}

/** 保存产品接触点（座位、握把、脚），按产品模型保存 */
export async function saveProductRigAction(modelId: string, rig: unknown): Promise<Result<true>> {
  const r = cleanRig(rig);
  if (!r) return { error: "接触点数据不完整" };
  try {
    saveRig(modelId, r);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
