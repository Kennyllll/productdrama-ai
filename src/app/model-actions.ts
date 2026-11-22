"use server";

// 产品白模 / 颜色款建模（fal）。花钱的一步：先 quote 出价格，用户在审批框点同意后 start 才提交；
// 提交前先记任务，同一个目标有进行中或状态不明的任务就不许再提交，断线后只查原任务，不重复扣费。
import { adminError, currentActor } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { grayGlb, groundGlb, realSizeFactor, scaleGlb, turnGlb } from "@/lib/glb-gray";
import { cleanRig, scaleRig } from "@/lib/figures";
import { saveRig } from "@/lib/product-rig-repo";
import { keyFromPath, putFile, readFile } from "@/lib/storage";
import { installCadTools, stepLengthCm, stepToGlb } from "@/lib/step-import";
import {
  buildInput,
  COLOR_REQUIRED,
  FalError,
  falPublicInfo,
  findProvider,
  outputUrl,
  queueResult,
  queueStatus,
  saveFalKey,
  submit,
  testFalKey,
  uploadToFal,
  WHITE_ANGLES,
  WHITE_REQUIRED,
  type Target,
} from "@/lib/fal";
import {
  addColor,
  addModelJob,
  addProductModel,
  deleteProductModel,
  getColor,
  getModelJob,
  getProductModel,
  getProductModelById,
  replaceModelFile,
  stepKey,
  isGlb,
  listProductModels,
  modelPath,
  openModelJob,
  reviewProductModel,
  updateModelJob,
} from "@/lib/model-repo";
import { addAsset, assetPath, deleteAsset, findLocalProject, getAsset, listAssets } from "@/lib/repo";
import { listShortVideos } from "@/lib/shorts-repo";
import type { AssetRecord, FormState } from "@/lib/types";

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown): { error: string } => ({ error: e instanceof Error ? e.message : String(e) });

const KEY_RE = /^[\x21-\x7e]{10,300}$/;
import { arkPublicInfo, saveArkKey, testArkKey } from "@/lib/ark";

export async function saveArkKeyAction(input: { key: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "修改设置", detail: "火山方舟 Key（Key 本身不记）" });
  if (input.clear) saveArkKey("");
  else {
    const key = (input.key ?? "").trim();
    if (key.length < 16 || /\s/.test(key)) return { error: "Key 格式不正确" };
    saveArkKey(key);
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除方舟 Key" : "已保存到本机", info: arkPublicInfo() };
}

export async function testArkAction(): Promise<FormState> {
  try {
    return { ok: `${await testArkKey()}（没有产生费用）` };
  } catch (e) {
    return fail(e);
  }
}

const MAX_MESH_UPLOAD = 90 * 1024 * 1024;

export async function saveFalKeyAction(input: { key: string; clear: boolean }): Promise<FormState & { info?: { configured: boolean; keyHint: string } }> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "修改设置", detail: "fal Key（Key 本身不记）" });
  if (input.clear) saveFalKey("");
  else {
    const key = (input.key ?? "").trim();
    if (!KEY_RE.test(key)) return { error: "Key 格式不正确" };
    saveFalKey(key);
  }
  revalidatePath("/settings");
  return { ok: input.clear ? "已清除 fal Key" : "已保存到本机", info: falPublicInfo() };
}

export async function testFalAction(): Promise<FormState> {
  try {
    return { ok: `${await testFalKey()}（没有产生费用）` };
  } catch (e) {
    return fail(e);
  }
}

const refresh = (projectId: string) => {
  revalidatePath(`/projects/${projectId}/product`);
  revalidatePath(`/projects/${projectId}/shorts`, "layout");
};

export interface ModelQuote {
  usd: number;
  label: string;
  uses: string[];
  colorName: string | null;
}

interface Plan extends ModelQuote {
  endpoint: string;
  provider: string;
  files: Record<string, AssetRecord>;
}

function plan(projectId: string, target: Target, colorId: string | null, providerId: string, refAngle: string): Plan {
  if (!findLocalProject(projectId)) throw new Error("项目不存在");
  if (!falPublicInfo().configured) throw new Error("尚未配置 fal Key，请到「模型设置」填写");
  const p = findProvider(providerId, target);
  if (!p) throw new Error("请选择建模服务");
  const open = openModelJob(projectId, target === "color" ? colorId : null);
  if (open) throw new Error(open.status === "unknown" ? "上一次提交状态不明（可能已扣费）：先到 fal 后台确认，再在任务旁点「确认没提交成功」" : "已经有一个建模任务在进行，等它完成");
  const assets = listAssets(projectId);
  const files: Record<string, AssetRecord> = {};
  let colorName: string | null = null;
  if (target === "shape" && p.id === "rodin") {
    // 不分角度：优先用能看清整体的几面，最多 5 张
    const order = ["正面", "左前 45°", "右前 45°", "左侧", "右侧", "背面", "左后 45°", "右后 45°", "顶部", "底部"];
    const mine = assets.filter((x) => x.kind === "white_photo").sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle)).slice(0, 5);
    if (mine.length < 2) throw new Error("Rodin 至少要 2 张白底照（哪一面都行）");
    for (const a of mine) files[a.angle] = a;
  } else if (target === "shape") {
    const need = p.id === "hunyuan" ? ["正面", "背面", "左侧"] : WHITE_REQUIRED;
    for (const a of need) {
      const f = assets.find((x) => x.kind === "white_photo" && x.angle === a);
      if (!f) throw new Error(`还缺白底照「${a}」：${WHITE_REQUIRED.join("、")} 必传`);
      files[a] = f;
    }
  } else {
    const c = colorId ? getColor(colorId) : null;
    if (!c || c.projectId !== projectId) throw new Error("颜色款不存在");
    colorName = c.name;
    if (!getProductModel(projectId)) throw new Error("还没有产品白模：先在产品资料里上传 GLB 或用白底照建模");
    const mine = assets.filter((x) => x.kind === "color_photo" && x.colorId === c.id);
    const missing = COLOR_REQUIRED.filter((a) => !mine.some((x) => x.angle === a));
    if (missing.length) throw new Error(`「${c.name}」还缺实物照：${missing.join("、")}`);
    const ref = mine.find((x) => x.angle === refAngle) ?? mine.find((x) => x.angle === "左前 45°")!;
    if (ref.mime === "image/svg+xml") throw new Error("参考照不能是 SVG");
    files.ref = ref;
  }
  const uses = target === "shape" ? Object.keys(files) : [`${files.ref.angle} 实物照`];
  return { usd: p.usd, label: p.label, uses, colorName, endpoint: p.endpoint, provider: p.id, files };
}

export async function quoteModelAction(projectId: string, target: Target, colorId: string | null, providerId: string, refAngle = ""): Promise<Result<ModelQuote>> {
  try {
    const q = plan(projectId, target, colorId, providerId, refAngle);
    return { result: { usd: q.usd, label: q.label, uses: q.uses, colorName: q.colorName } };
  } catch (e) {
    return fail(e);
  }
}

const dataUri = (file: string, mime: string) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;

/** 用户在审批框点了同意：confirmUsd 必须和当前报价一致 */
export async function startModelAction(projectId: string, target: Target, colorId: string | null, providerId: string, refAngle: string, confirmUsd: number): Promise<Result<string>> {
  let jobId: string | null = null;
  try {
    const q = plan(projectId, target, colorId, providerId, refAngle);
    if (Math.abs(q.usd - confirmUsd) > 0.001) throw new Error("价格变了，请重新确认");
    const images: Record<string, string> = {};
    for (const [k, a] of Object.entries(q.files)) {
      if (!fs.existsSync(assetPath(a))) throw new Error(`照片文件不见了：${a.angle}`);
      images[k] = dataUri(assetPath(a), a.mime);
    }
    let meshUrl: string | undefined;
    if (target === "color") {
      const base = getProductModel(projectId)!;
      if (base.remoteUrl) meshUrl = base.remoteUrl;
      else {
        if (base.size > MAX_MESH_UPLOAD) throw new Error(`原模型 ${(base.size / 1024 / 1024).toFixed(0)} MB，太大，不能传给贴色服务`);
        // 上传免费，只传一次：地址记在模型上，下一个颜色款直接用
        meshUrl = await uploadToFal(fs.readFileSync(modelPath(base)), "model/gltf-binary", "base.glb");
        getDb().prepare("UPDATE product_models SET remote_url = ? WHERE id = ?").run(meshUrl, base.id);
      }
    }
    const p = findProvider(providerId, target)!;
    const job = addModelJob({ projectId, target, colorId: target === "color" ? colorId : null, provider: p.id, endpoint: p.endpoint, estUsd: p.usd });
    jobId = job.id;
    const r = await submit(p.endpoint, buildInput(p, images, meshUrl));
    updateModelJob(job.id, { status: "submitted", requestId: r.request_id, statusUrl: r.status_url, responseUrl: r.response_url });
    refresh(projectId);
    return { result: job.id };
  } catch (e) {
    if (jobId) {
      // 服务器明确拒绝 = 没提交成功、不收费；网络错误 = 不知道有没有提交上，锁住等用户确认
      const definite = e instanceof FalError && !!e.status;
      updateModelJob(jobId, { status: definite ? "failed" : "unknown", error: e instanceof Error ? e.message : String(e) });
      refresh(projectId);
    }
    return fail(e);
  }
}

function addLedger(projectId: string, model: string, usd: number, note: string) {
  getDb()
    .prepare("INSERT INTO ledger (id, project_id, episode, shot_code, kind, model, usd, exact, used, note, created_at) VALUES (?, ?, 0, '', 'model3d', ?, ?, 0, 0, ?, ?)")
    .run(randomUUID(), projectId, model, usd, note, new Date().toISOString());
}

/** 查任务进度（免费）；完成就把 GLB 下载回本机，进「待审核」 */
export async function pollModelJobAction(jobId: string): Promise<Result<{ status: string; modelId?: string }>> {
  try {
    const j = getModelJob(jobId);
    if (!j) throw new Error("任务不存在");
    if (j.status !== "submitted" || !j.statusUrl || !j.responseUrl) return { result: { status: j.status, modelId: j.modelId ?? undefined } };
    const s = await queueStatus(j.statusUrl);
    if (s !== "COMPLETED") return { result: { status: s === "IN_PROGRESS" ? "生成中" : "排队中" } };
    let data: unknown;
    try {
      data = await queueResult(j.responseUrl);
    } catch (e) {
      if (e instanceof FalError && e.status && e.status !== 429 && e.status < 500) {
        updateModelJob(j.id, { status: "failed", error: e.message });
        refresh(j.projectId);
        return { result: { status: "failed" } };
      }
      throw e;
    }
    const url = outputUrl(data);
    if (!url) throw new Error("结果里没有 GLB 文件");
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`下载模型失败（HTTP ${res.status}），稍后再点「查看进度」`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!isGlb(bytes)) throw new Error("下载到的不是 GLB 文件");
    const p = findProvider(j.provider, j.target);
    const color = j.colorId ? getColor(j.colorId) : null;
    // AI 建出来的贴图（尤其 Logo）不可信：白模一律转灰，只留形状
    const m = addProductModel({
      projectId: j.projectId,
      originalName: `${p?.label ?? j.provider}${color ? ` · ${color.name}` : " · 灰模"}.glb`,
      bytes: j.target === "shape" ? groundGlb(grayGlb(bytes)) : bytes,
      status: "review",
      colorId: j.colorId,
      source: "fal",
      remoteUrl: url,
    });
    updateModelJob(j.id, { status: "done", modelId: m.id });
    addLedger(j.projectId, j.endpoint, j.estUsd, color ? `颜色款「${color.name}」贴色` : "白底照建白模");
    refresh(j.projectId);
    return { result: { status: "done", modelId: m.id } };
  } catch (e) {
    return fail(e);
  }
}

/** 状态不明的任务：用户到 fal 后台确认没有扣费后手动解除 */
export async function clearUnknownJobAction(jobId: string): Promise<Result<true>> {
  const j = getModelJob(jobId);
  if (!j || j.status !== "unknown") return { error: "只有状态不明的任务可以解除" };
  updateModelJob(j.id, { status: "failed", error: `${j.error ?? ""}（用户确认没提交成功）` });
  refresh(j.projectId);
  return { result: true };
}

/** 安装本机 CAD 转换工具（STEP / DXF 用，免费） */
export async function installCadToolsAction(): Promise<Result<true>> {
  try {
    await installCadTools();
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** 工厂 STEP 转出来车是躺着的：换朝上的轴（z ↔ y）重新转换（免费） */
export async function flipStepUpAction(modelId: string): Promise<Result<"z" | "y">> {
  try {
    const m = getProductModelById(modelId);
    if (!m || m.source !== "step") throw new Error("只有工厂 STEP 模型能换朝上的轴");
    if (m.status !== "review") throw new Error("只有待审核的模型能改");
    const metaKey = keyFromPath(`${modelPath(m)}.up`);
    let cur: "z" | "y" = "z";
    try {
      cur = readFile(metaKey).toString() === "y" ? "y" : "z";
    } catch {
      // 没记过 = 默认 z
    }
    const up = cur === "z" ? "y" : "z";
    const { glb, info } = await stepToGlb(readFile(stepKey(m)), up);
    replaceModelFile(m.id, glb, stepLengthCm(info, up));
    putFile(metaKey, Buffer.from(up));
    refresh(m.projectId);
    return { result: up };
  } catch (e) {
    return fail(e);
  }
}

/** 待审核模型车头不对：整体绕竖轴转一下（免费，只改本机文件） */
export async function turnModelAction(modelId: string, deg: number): Promise<Result<true>> {
  try {
    const m = getProductModelById(modelId);
    if (!m) throw new Error("模型不存在");
    if (m.status !== "review") throw new Error("只有待审核的模型能转方向");
    if (![90, -90, 180].includes(deg)) throw new Error("只能转 90° 或 180°");
    const k = keyFromPath(modelPath(m));
    putFile(k, turnGlb(readFile(k), deg));
    refresh(m.projectId);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** rig：审核页上确认过的接触点，单位和审核页看到的模型一致（AI 模型是缩放前的模型单位） */
export async function reviewModelAction(modelId: string, ok: boolean, lengthCm: number | null, note: string, rig: unknown = null): Promise<Result<true>> {
  try {
    const m = getProductModelById(modelId);
    if (!m) throw new Error("模型不存在");
    if (ok && m.colorId === null && !(lengthCm && lengthCm > 5 && lengthCm < 1000)) throw new Error("请填产品真实长度（厘米）");
    if (!ok && !note.trim()) throw new Error("写一句哪里不对，方便重做时改");
    reviewProductModel(modelId, ok, { lengthCm, note });
    // AI 模型没有单位：通过时按真实长度缩放到米，3D 编辑器、截图里和人偶比例才对
    let factor = 1;
    if (ok && m.source === "fal" && m.colorId === null && lengthCm) {
      const k = keyFromPath(modelPath(m));
      const buf = readFile(k);
      factor = realSizeFactor(buf, lengthCm / 100) ?? 1;
      putFile(k, scaleGlb(buf, lengthCm / 100));
    }
    const g = ok && m.colorId === null ? cleanRig(rig) : null;
    if (g) saveRig(modelId, scaleRig(g, factor));
    refresh(m.projectId);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCandidateAction(modelId: string): Promise<Result<true>> {
  const m = getProductModelById(modelId);
  if (!m || m.status === "approved") return { error: "在用的模型不能在这里删" };
  deleteProductModel(modelId);
  refresh(m.projectId);
  return { result: true };
}

/** 已传过的产品照片直接放进白底照 / 颜色款的某一格（拷贝一份，免费，不用重新上传） */
export async function reuseAssetAction(assetId: string, kind: "white_photo" | "color_photo", angle: string, colorId: string | null = null): Promise<Result<true>> {
  try {
    const a = getAsset(assetId);
    if (!a || !fs.existsSync(assetPath(a))) throw new Error("照片不存在");
    if (a.mime === "image/svg+xml") throw new Error("SVG 不能用来建模");
    if (!(WHITE_ANGLES as readonly string[]).includes(angle)) throw new Error("请选放进哪一面");
    if (kind === "color_photo" && getColor(colorId ?? "")?.projectId !== a.projectId) throw new Error("颜色款不存在");
    addAsset({ projectId: a.projectId, kind, angle, colorId: kind === "color_photo" ? colorId : null, originalName: a.originalName, bytes: fs.readFileSync(assetPath(a)), mime: a.mime, ext: path.extname(a.fileName).slice(1) || "jpg" });
    refresh(a.projectId);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addColorAction(projectId: string, name: string): Promise<Result<string>> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    const c = addColor(projectId, name);
    refresh(projectId);
    return { result: c.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteColorAction(colorId: string): Promise<Result<true>> {
  try {
    const c = getColor(colorId);
    if (!c) throw new Error("颜色款不存在");
    const used = listShortVideos(c.projectId).filter((v) => v.colorId === c.id);
    if (used.length) throw new Error(`「${used.map((v) => v.title).join("」「")}」在用这个颜色款，先在视频设定里换掉`);
    if (openModelJob(c.projectId, c.id)) throw new Error("这个颜色款还有建模任务在进行");
    for (const a of listAssets(c.projectId).filter((x) => x.kind === "color_photo" && x.colorId === c.id)) deleteAsset(a.id);
    for (const m of listProductModels(c.projectId).filter((x) => x.colorId === c.id)) deleteProductModel(m.id);
    getDb().prepare("DELETE FROM product_colors WHERE id = ?").run(c.id);
    refresh(c.projectId);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
