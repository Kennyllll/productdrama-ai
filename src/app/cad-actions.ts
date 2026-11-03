"use server";

import fs from "node:fs";
import path from "node:path";
import { BlenderError, findBlender, renderProduct } from "@/lib/blender";
import { CAD_KEYFRAME_MODEL, clampCadParams, buildPlatePrompt, harmonizePrompt, type CadParams } from "@/lib/cad-camera";
import { composeProduct, protectProduct } from "@/lib/cad-composite";
import { deleteRequest, estimate, HiggsfieldError, submit, uploadFile, waitFor } from "@/lib/higgsfield";
import { addKeyframe, toKeyframeView, type KeyframeView } from "@/lib/keyframe-repo";
import { cadDir, getProductModel, modelPath } from "@/lib/model-repo";
import { findLocalProject, getProduct } from "@/lib/repo";
import { getStoryboard } from "@/lib/storyboard-repo";

type Result<T> = { error?: string; result?: T };
const fail = (e: unknown) => ({ error: e instanceof HiggsfieldError || e instanceof BlenderError ? e.message : e instanceof Error ? e.message : "处理失败" });

const PLATE_MODEL = "marketing-studio/image/flare";

const plateInput = (prompt: string, aspect: string, imageUrls: string[] = []) => ({
  prompt,
  image_urls: imageUrls,
  quality: "xhigh",
  resolution: "2k",
  aspect_ratio: aspect === "9:16" ? "9:16" : aspect === "16:9" ? "16:9" : "21:9",
  enhance_prompt: false,
});

async function runFlare(input: Record<string, unknown>): Promise<Buffer> {
  const req = await submit(PLATE_MODEL, input);
  try {
    const done = await waitFor(req.request_id);
    const url = done.images?.[0]?.url;
    if (!url) throw new HiggsfieldError("没有返回图片");
    const res = await fetch(url);
    if (!res.ok) throw new HiggsfieldError(`下载图片失败（HTTP ${res.status}）`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    await deleteRequest(req.request_id).catch(() => undefined);
  }
}

function modelOrThrow(projectId: string) {
  if (!findLocalProject(projectId)) throw new Error("项目不存在或为示例项目");
  const m = getProductModel(projectId);
  if (!m || !fs.existsSync(modelPath(m))) throw new BlenderError("请先在产品页上传带材质的 GLB 模型");
  return m;
}

/** 产品页：用默认英雄机位渲染一张，检查模型、材质与 Blender 是否正常 */
export async function testRenderAction(projectId: string): Promise<Result<{ url: string; seconds: number }>> {
  try {
    const m = modelOrThrow(projectId);
    const t0 = Date.now();
    const out = path.join(cadDir(projectId), "test-hero.png");
    await renderProduct({
      glb: modelPath(m),
      out,
      width: 1400,
      height: 900,
      azimuth_deg: -38,
      elevation_deg: 8,
      lens_mm: 50,
      key_dir_deg: -60,
      key_elev_deg: 35,
      key_kelvin: 5400,
      samples: 96,
    });
    return { result: { url: `/api/cad/${projectId}?f=test-hero.png&t=${Date.now()}`, seconds: Math.round((Date.now() - t0) / 1000) } };
  } catch (e) {
    return fail(e);
  }
}

export async function cadStatusAction(projectId: string): Promise<{ blender: boolean; model: boolean }> {
  return { blender: Boolean(findBlender()), model: Boolean(getProductModel(projectId)) };
}

export async function estimateCadKeyframeAction(projectId: string, harmonize: boolean): Promise<Result<{ usd: number; note: string }>> {
  try {
    modelOrThrow(projectId);
    const board = getStoryboard(projectId);
    const { usd, description } = await estimate(PLATE_MODEL, plateInput("estimate", board?.visualSpec.aspectRatio ?? "2.39:1"));
    return { result: { usd: Number.isFinite(usd) ? usd * (harmonize ? 2 : 1) : NaN, note: description.slice(0, 300) } };
  } catch (e) {
    return fail(e);
  }
}

export interface CadKeyframeResult {
  keyframe: KeyframeView;
  files: { product: string; plate: string; composite: string; harmonized?: string };
  aiDrift: number | null;
  renderSeconds: number;
}

/**
 * CAD 保护合成关键帧：
 * 1) Blender 按机位渲染产品（透明背景 + 接触阴影 + 产品遮罩）
 * 2) Flare 生成不含产品的空场景
 * 3) 本机合成（sharp）
 * 4) 可选：Flare 融合阴影 / 色温，然后用遮罩把原始产品像素贴回 → 产品零变形
 */
export async function generateCadKeyframeAction(projectId: string, shotId: string, raw: CadParams, basePrompt: string): Promise<Result<CadKeyframeResult>> {
  try {
    const m = modelOrThrow(projectId);
    const board = getStoryboard(projectId);
    const shot = board?.episodes.flatMap((e) => e.shots).find((s) => s.id === shotId);
    if (!board || !shot) throw new Error("镜头不存在，请先保存分镜");
    if (!/^[a-z0-9-]+$/i.test(shotId)) throw new Error("镜头 ID 无效");
    const p = clampCadParams(raw);
    const productName = getProduct(projectId)?.name ?? "";
    const dir = path.join(cadDir(projectId), shotId.toLowerCase());
    fs.mkdirSync(dir, { recursive: true });

    // 1) 空场景（可复用上次的，便于只调产品光线 / 位置）
    const platePrompt = buildPlatePrompt(basePrompt, p, productName);
    const plateFile = path.join(dir, "plate.png");
    const reused = p.reusePlate && fs.existsSync(plateFile);
    const unit = reused ? 0 : await estimate(PLATE_MODEL, plateInput(platePrompt, board.visualSpec.aspectRatio)).then((r) => r.usd).catch(() => NaN);
    const plate = reused ? fs.readFileSync(plateFile) : await runFlare(plateInput(platePrompt, board.visualSpec.aspectRatio));
    if (!reused) fs.writeFileSync(plateFile, plate);

    // 2) 用空场景当环境光渲染产品（含接触阴影、遮罩、地面倒影层）
    const t0 = Date.now();
    const render = await renderProduct({
      glb: modelPath(m),
      out: path.join(dir, "product.png"),
      width: 1600,
      height: 1600,
      azimuth_deg: p.azimuthDeg,
      elevation_deg: p.elevationDeg,
      lens_mm: p.lensMm,
      key_dir_deg: p.keyDirDeg,
      key_elev_deg: p.keyElevDeg,
      key_kelvin: p.keyKelvin,
      env_image: plateFile,
      env_strength: p.envStrength,
      exposure: p.exposure,
      floor_roughness: p.floorRoughness,
      samples: 128,
    });
    const renderSeconds = Math.round((Date.now() - t0) / 1000);

    // 3) 本机合成：倒影层（screen）→ 产品层
    const comp = await composeProduct(plate, render.image, render.mask, p, { file: render.reflection, strength: p.reflection });
    fs.writeFileSync(path.join(dir, "composite.png"), comp.composite);
    fs.writeFileSync(path.join(dir, "mask.png"), comp.mask);

    let finalBytes = comp.composite;
    let aiDrift: number | null = null;
    let harmonizedUrl: string | undefined;
    if (p.harmonize) {
      const url = await uploadFile(comp.composite, "image/png");
      const harmonized = await runFlare(plateInput(harmonizePrompt(productName), board.visualSpec.aspectRatio, [url]));
      fs.writeFileSync(path.join(dir, "harmonized.png"), harmonized);
      const prot = await protectProduct(harmonized, comp.composite, comp.mask, comp.width, comp.height, p.protect);
      finalBytes = prot.final;
      aiDrift = Math.round(prot.aiDrift * 10) / 10;
      harmonizedUrl = `/api/cad/${projectId}?f=${shotId.toLowerCase()}/harmonized.png`;
    }
    fs.writeFileSync(path.join(dir, "final.png"), finalBytes);

    const usd = (Number.isFinite(unit) ? unit : 0) + (p.harmonize && Number.isFinite(unit) ? unit : 0);
    const k = addKeyframe({
      projectId,
      shotId,
      bytes: finalBytes,
      model: CAD_KEYFRAME_MODEL,
      prompt: `${platePrompt}\n\n[CAD] ${JSON.stringify(p)}`,
      usd,
    });
    if (!k) throw new Error("保存关键帧失败");
    const f = (name: string) => `/api/cad/${projectId}?f=${shotId.toLowerCase()}/${name}`;
    return {
      result: {
        keyframe: toKeyframeView(k),
        files: { product: f("product.png"), plate: f("plate.png"), composite: f("composite.png"), harmonized: harmonizedUrl },
        aiDrift,
        renderSeconds,
      },
    };
  } catch (e) {
    return fail(e);
  }
}
