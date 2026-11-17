"use server";

import { productPhotos } from "@/lib/product-photos";
import fs from "node:fs";
import { getEgg, getProjectEggId, findPhoto, listCharacters, listPhotos, photoPath } from "@/lib/cast-repo";
import { deleteRequest, estimate, HiggsfieldError, submit, uploadFile, waitFor } from "@/lib/higgsfield";
import { addKeyframe, deleteKeyframe, getKeyframe, selectKeyframe, toKeyframeView, type KeyframeView } from "@/lib/keyframe-repo";
import { isKeyframeModel, KEYFRAME_MODELS, modelInput } from "@/lib/keyframe-prompt";
import { assetPath, findLocalProject, listAssets } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";

type Result<T> = { error?: string; result?: T };
const fail = (e: unknown) => ({ error: e instanceof HiggsfieldError ? e.message : e instanceof Error ? e.message : "生成失败" });

function context(projectId: string, shotId: string) {
  if (!findLocalProject(projectId)) throw new Error("项目不存在或为示例项目");
  const board = getStoryboard(projectId);
  const shot = board?.episodes.flatMap((e) => e.shots).find((s) => s.id === shotId);
  if (!board || !shot) throw new Error("镜头不存在，请先保存分镜");
  return { board, shot };
}

/** 本镜参考图（本机路径 + MIME）：产品照与 Logo、出场角色照、彩蛋照 */
function referenceFiles(projectId: string, shot: { product: string; characterIds: string[]; hasPetEasterEgg: boolean }, max: number) {
  type Ref = { path: string; mime: string };
  const exists = (f: Ref) => fs.existsSync(f.path);
  let photos: Ref[] = [];
  let logo: Ref[] = [];
  if (shot.product !== "无") {
    const assets = listAssets(projectId);
    photos = productPhotos(assets).slice(0, 6).map((a) => ({ path: assetPath(a), mime: a.mime })).filter(exists);
    const l = assets.find((x) => x.kind === "logo" && x.mime !== "image/svg+xml");
    if (l) logo = [{ path: assetPath(l), mime: l.mime }].filter(exists);
  }
  const people: Ref[] = [];
  for (const ch of listCharacters(projectId).filter((c) => shot.characterIds.includes(c.id))) {
    for (const p of listPhotos("character", ch.id).slice(0, 2)) {
      const rec = findPhoto(p.id);
      if (rec) people.push({ path: photoPath(rec), mime: rec.mime });
    }
  }
  const eggId = shot.hasPetEasterEgg ? getProjectEggId(projectId) : null;
  if (eggId && getEgg(eggId)) {
    for (const p of listPhotos("egg", eggId).slice(0, 2)) {
      const rec = findPhoto(p.id);
      if (rec) people.push({ path: photoPath(rec), mime: rec.mime });
    }
  }
  const extras = people.filter(exists);
  // 参考图名额有限时：至少保留 1 张产品照和 Logo，其余名额先给角色 / 彩蛋
  const room = Math.max(1, max - logo.length - extras.length);
  return [...photos.slice(0, room), ...logo, ...extras].slice(0, max);
}

export async function estimateKeyframesAction(projectId: string, shotId: string, model: string, count: number): Promise<Result<{ usd: number; refs: number; note: string }>> {
  try {
    if (!isKeyframeModel(model)) return { error: "未知模型" };
    const { board, shot } = context(projectId, shotId);
    const max = KEYFRAME_MODELS.find((m) => m.id === model)!.maxRefs;
    const refs = referenceFiles(projectId, shot, max);
    const { usd, description } = await estimate(model, modelInput(model, "estimate", refs.map((_, i) => `https://example.com/ref${i}.jpg`), board.visualSpec.aspectRatio));
    return { result: { usd: Number.isFinite(usd) ? usd * Math.max(1, Math.min(4, count)) : NaN, refs: refs.length, note: description.slice(0, 300) } };
  } catch (e) {
    return fail(e);
  }
}

export async function generateKeyframesAction(projectId: string, shotId: string, model: string, count: number, prompt: string): Promise<Result<KeyframeView[]>> {
  try {
    if (!isKeyframeModel(model)) return { error: "未知模型" };
    if (!prompt.trim()) return { error: "提示词不能为空" };
    const { board, shot } = context(projectId, shotId);
    const max = KEYFRAME_MODELS.find((m) => m.id === model)!.maxRefs;
    const urls: string[] = [];
    for (const f of referenceFiles(projectId, shot, max)) urls.push(await uploadFile(fs.readFileSync(f.path), f.mime));
    const input = modelInput(model, prompt.slice(0, 5000), urls, board.visualSpec.aspectRatio);
    const unit = await estimate(model, input).then((r) => r.usd).catch(() => NaN);
    const out: KeyframeView[] = [];
    for (let i = 0; i < Math.max(1, Math.min(4, count)); i++) {
      const req = await submit(model, input);
      try {
        const done = await waitFor(req.request_id);
        const url = done.images?.[0]?.url;
        if (!url) throw new HiggsfieldError("没有返回图片");
        const res = await fetch(url);
        if (!res.ok) throw new HiggsfieldError(`下载图片失败（HTTP ${res.status}）`);
        const k = addKeyframe({ projectId, shotId, bytes: Buffer.from(await res.arrayBuffer()), model, prompt, usd: Number.isFinite(unit) ? unit : 0 });
        if (k) out.push(toKeyframeView(k));
      } finally {
        await deleteRequest(req.request_id).catch(() => undefined);
      }
    }
    return { result: out };
  } catch (e) {
    return fail(e);
  }
}

export async function selectKeyframeAction(keyframeId: string): Promise<Result<KeyframeView>> {
  const k = getKeyframe(keyframeId);
  if (!k || !findLocalProject(k.projectId)) return { error: "关键帧不存在" };
  const s = selectKeyframe(keyframeId);
  return s ? { result: toKeyframeView(s) } : { error: "选定失败" };
}

export async function deleteKeyframeAction(keyframeId: string): Promise<Result<true>> {
  return deleteKeyframe(keyframeId) ? { result: true } : { error: "关键帧不存在" };
}
