"use server";

import fs from "node:fs";
import { productPhotos } from "@/lib/product-photos";
import { keyFromPath, putFile, readFile, storageKey } from "@/lib/storage";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AiError, chatJson } from "@/lib/ai/client";
import { getVisionKey, reviewShortFrame, reviewShortVideo } from "@/lib/vision-qa";
import ffmpegPath from "ffmpeg-static";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHook, getHook } from "@/lib/hooks-repo";
import { cleanHookValues, fillCaption, HOOK_ENTRIES } from "@/lib/hooks";
import { isHookEffect } from "@/lib/hook-effects";
import { hookParts, hooksOf, isExtraHook, shotSound } from "@/lib/shorts";
import { applySelfie, buildHookLayout, cleanHookPeople, DEFAULT_STAGE, peopleText, renameText, VIEW_LABEL, type HookPerson } from "@/lib/hook-stage";
import { shortConceptPrompt, shortShotsPrompt } from "@/lib/ai/short-prompts";
import { deleteRequest, estimate, getStatus, HiggsfieldError, submit, uploadFile, type HfRequest } from "@/lib/higgsfield";
import { arkFindTask, arkGetTask, arkSubmitVideo, arkUsd, isArkModel, type ArkVideoInput } from "@/lib/ark";
import { assetPath, findLocalProject, getProduct, listAssets } from "@/lib/repo";
import {
  findTemplate,
  FRAME_MODEL,
  FRAME_USD_FALLBACK,
  paramsKey,
  quoteJob,
  VIDEO_MIN_SEC,
  shotHasPeople,
  videoModelOf,
  videoUsdPerSec,
  VIDEO_USD_PER_SEC,
  type GenJob,
  type JobKind,
  type Quote,
  type ShortConcept,
  type ShortShot,
  type ShortVideo,
  type VideoResolution,
  operatorPrompt,
  videoTheme,
  waitingFor,
  type ShotHook,
} from "@/lib/shorts";
import { lastFrame, renderShort } from "@/lib/shorts-render";
import { cleanLayout, dropCameraMoves, guessRoom, layoutText, moveText, PRODUCT_REF_VIEWS } from "@/lib/shorts-set";
import { findTheme, sceneText } from "@/lib/shorts-scenes";
import { createScene, ensureScenes, getScene, legacyShotScene, saveScene, themedScene, versionOf } from "@/lib/shorts-scenes-repo";
import { createTemplate, deleteTemplate, getTemplate, saveTemplate, type TemplateScene, type TemplateShot } from "@/lib/shorts-templates-repo";
import type { Scene } from "@/lib/shorts-scenes";
import { cadDir, getColor, getProductModel, modelFor, modelPath } from "@/lib/model-repo";
import { addRule, type SetLayout, type SetMove } from "@/lib/production-repo";
import { figuresOf, KB002_RIG, RIDE_KINDS, rideKindOf } from "@/lib/figures";
import { basisOf, shotChecks, shotSync, TEXT_FIELDS, type ShotSync, type TextField } from "@/lib/shorts-sync";
import { cleanShotNotes, dropGlare } from "@/lib/prompt-clean";
import { captionIssues, castConflicts, fullSync, placeOf, rigOf, syncOf } from "@/lib/shorts-sync-state";
import { opCompKey, operatorShows, opMissing, parseOp, opString, OP_POSES, poseOf } from "@/lib/shorts-operator";
import { blockingText, itemSight } from "@/lib/shorts-blocking";
import path from "node:path";
import {
  addLedgerEntry,
  createShortVideo,
  deleteShortVideo,
  getJob,
  getShortVideo,
  hookFinalPath,
  finalPath,
  insertJob,
  jobFilePath,
  listJobs,
  listShortVideos,
  saveJobOutput,
  saveShortVideo,
  toJobView,
  videoDir,
  updateJob,
  type JobRecord,
} from "@/lib/shorts-repo";
import { runKey, runningOf, runs, type RunInfo } from "@/lib/shorts-runs";
import { getRig } from "@/lib/product-rig-repo";
import { castOf, getFamily, portraitPath } from "@/lib/families-repo";
import { memberKind, memberText, filmerId, portraitFor, type FamilyMember } from "@/lib/families";
import { fitFigureActions, promptConflicts } from "@/lib/shorts-conflicts";

type Result<T> = { error?: string; result?: T };
const fail = (e: unknown) => ({ error: e instanceof HiggsfieldError || e instanceof AiError || e instanceof Error ? e.message : "操作失败" });

export interface StudioState {
  /** 后台生成中（含失败原因，用户点“知道了”才清掉） */
  running: Record<string, RunInfo>;
  video: ShortVideo;
  jobs: GenJob[];
  /** 每镜文字和 3D 的同步检查 */
  sync: Record<string, ShotSync>;
}

const state = (videoId: string): StudioState => {
  const video = getShortVideo(videoId)!;
  return { video, jobs: listJobs(videoId).map(toJobView), sync: syncOf(video), running: runningOf(videoId, (id) => getJob(id)?.status === "completed") };
};

function load(videoId: string): ShortVideo {
  const v = getShortVideo(videoId);
  if (!v || !findLocalProject(v.projectId)) throw new Error("短视频不存在");
  return v;
}

const refresh = (v: { projectId: string; id: string }) => revalidatePath(`/projects/${v.projectId}/shorts/${v.id}`);

function productText(projectId: string): string {
  const p = getProduct(projectId);
  if (!p) return "（产品资料为空）";
  return [
    `名称：${p.name || "未填写"}；品类：${p.category || "未填写"}`,
    p.sellingPoints.length ? `卖点：${p.sellingPoints.join("；")}` : "",
    ...p.bible.filter((f) => f.value.trim()).map((f) => `${f.label}：${f.value}`),
  ]
    .filter(Boolean)
    .join("\n");
}

const hasPackaging = (projectId: string) => listAssets(projectId).some((a) => a.kind === "packaging_photo");
function requirePackaging(projectId: string, templateId: string) {
  if (findTemplate(templateId).needsPackaging && !hasPackaging(projectId)) throw new Error("开箱视频要先在产品页上传真实包装照片，包装不让 AI 编");
}

/** 家庭位 → 家庭库 id：只留存在的家庭 */
function cleanFams(f: Record<string, string> | undefined): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, id] of Object.entries(f ?? {})) if (/^[1-9]$/.test(k) && typeof id === "string" && getFamily(id)) out[k] = id;
  return Object.keys(out).length ? out : undefined;
}

export async function createShortVideoAction(projectId: string, title: string, templateId: string, theme = "none", themeText = "", families?: Record<string, string>): Promise<Result<string>> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    requirePackaging(projectId, templateId);
    const th = findTheme(theme).id;
    const text = th === "custom" ? themeText.trim().slice(0, 300) : "";
    if (th === "custom" && !text) throw new Error("自定义节日要写清楚是什么节日");
    const t = title.trim().slice(0, 60) || `${findTemplate(templateId).label} · ${listShortVideos(projectId).length + 1}`;
    const id = createShortVideo(projectId, t, findTemplate(templateId).id, { theme: th, themeText: text || undefined });
    const fams = cleanFams(families);
    if (fams) {
      const nv = load(id);
      nv.families = fams;
      saveShortVideo(nv);
    }
    revalidatePath(`/projects/${projectId}/shorts`);
    return { result: id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteShortVideoAction(videoId: string): Promise<Result<true>> {
  try {
    const v = load(videoId);
    if (listJobs(videoId).some((j) => j.status === "submitting" || j.status === "submitted")) throw new Error("还有任务在生成中，等结束再删");
    deleteShortVideo(videoId);
    revalidatePath(`/projects/${v.projectId}/shorts`);
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

const clampNum = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
const str = (s: unknown, max: number) => (typeof s === "string" ? s.slice(0, max) : "");

function cleanHook(h: unknown, useSeconds: number): ShotHook {
  const x = (h ?? {}) as Partial<ShotHook>;
  const cut = typeof x.cut === "number" && x.cut >= 0.3 && x.cut <= useSeconds - 0.3 ? Math.round(x.cut * 10) / 10 : undefined;
  const lib =
    typeof x.libId === "string" && x.libId
      ? {
          libId: x.libId.slice(0, 60),
          libName: str(x.libName, 40),
          values: Object.fromEntries(Object.entries(x.values && typeof x.values === "object" ? x.values : {}).filter(([k, val]) => /^\w{1,30}$/.test(k) && typeof val === "string").slice(0, 12).map(([k, val]) => [k, String(val).slice(0, 200)])),
          entry: str(x.entry, 20),
          captionTpl: str(x.captionTpl, 200),
          visualKeys: Array.isArray(x.visualKeys) ? x.visualKeys.filter((k): k is string => typeof k === "string").slice(0, 12) : [],
        }
      : {};
  const fx = {
    ...(isHookEffect(x.effect) ? { effect: x.effect } : {}),
    ...(x.selfie ? { selfie: true, line: str(x.line, 200).trim(), ...(x.scene === "car" ? { scene: "car" as const } : {}), ...(typeof x.who === "string" && x.who ? { who: x.who.slice(0, 60) } : {}) } : {}),
    ...(typeof x.partOf === "string" && x.partOf ? { partOf: x.partOf.slice(0, 60) } : {}),
  };
  return { name: str(x.name, 30).trim() || "开头", cut, zoomB: cut ? Math.round(clampNum(x.zoomB, 1, 1.5, 1) * 100) / 100 : undefined, ...lib, ...fx };
}

/** 正文镜头默认露一点拍摄者，像家长随手拍：低机位就蹲着；有孩子的镜头隔一镜伸手 / 指；户外只拍产品的镜头露影子 */
function defaultOperator(s: ShortShot, i: number): string {
  const t = `${s.camera} ${s.description}`.toLowerCase();
  const pose = /低机位|低角度|地面|蹲|low angle|floor/.test(t) ? "crouch" : "stand";
  const kid = /孩子|女儿|儿子|宝宝|小孩|child|kid|toddler|boy|girl/.test(t);
  const out = /户外|室外|车道|院子|后院|公园|人行道|outdoor|driveway|yard|park|sidewalk/.test(t);
  if (kid && i % 2 === 1) return `${pose}+hand=${i % 4 === 1 ? "point" : "reach"}`;
  if (!kid && out) return `${pose}+shadow`;
  return pose;
}

function cleanShot(s: Partial<ShortShot>, prev?: ShortShot): ShortShot {
  const genSeconds = Math.round(clampNum(s.genSeconds, VIDEO_MIN_SEC, 12, VIDEO_MIN_SEC));
  return {
    id: prev?.id ?? (typeof s.id === "string" && /^[a-z0-9-]{4,40}$/.test(s.id) ? s.id : randomUUID().slice(0, 8)),
    beat: str(s.beat, 40),
    useSeconds: Math.round(clampNum(s.useSeconds, 1, genSeconds, Math.min(3, genSeconds)) * 10) / 10,
    trimStart: Math.round(clampNum(s.trimStart, 0, 11, 0) * 10) / 10,
    genSeconds,
    description: str(s.description, 600),
    camera: str(s.camera, 200),
    caption: str(s.caption, 160),
    productNote: str(s.productNote, 300),
    compositeNote: str(s.compositeNote, 300),
    operator: str(s.operator, 200),
    filmer: s.filmer ? str(s.filmer, 80) : undefined,
    framePrompt: str(s.framePrompt, 2000),
    motionPrompt: str(s.motionPrompt, 1000),
    // 关口状态只能由关口动作改变，编辑时沿用服务器上的值
    stage: prev?.stage ?? "draft",
    issues: prev?.issues ?? [],
    frameCheck: prev?.frameCheck,
    layout: prev?.layout ?? null,
    compFile: prev?.compFile ?? null,
    frameJobId: prev?.frameJobId ?? null,
    videoJobId: prev?.videoJobId ?? null,
    checkNote: str(s.checkNote, 400),
    textBasis: prev?.textBasis,
    // 场地、家庭、镜头特殊要求由场地地图管理，保存分镜时沿用服务器上的值
    scene: prev?.scene,
    family: prev?.family,
    special: prev?.special,
    hook: s.hook ? cleanHook(s.hook, genSeconds) : s.hook === undefined ? prev?.hook : undefined,
  };
}

export async function saveShortVideoAction(
  videoId: string,
  patch: { title?: string; brief?: string; templateId?: string; resolution?: VideoResolution; sound?: boolean; conceptId?: string | null; shots?: Partial<ShortShot>[]; exportHooks?: string[]; captions?: boolean; colorId?: string | null },
): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    if (patch.colorId !== undefined) {
      const c = patch.colorId ? getColor(patch.colorId) : null;
      if (patch.colorId && (!c || c.projectId !== v.projectId)) throw new Error("颜色款不存在");
      if ((v.colorId ?? null) !== (c?.id ?? null) && v.shots.some((s) => s.stage !== "draft" || s.frameJobId)) throw new Error("已经有镜头确认或出过首帧，不能换颜色款：新建一条视频用新颜色");
      v.colorId = c?.id ?? null;
    }
    if (patch.title !== undefined) v.title = patch.title.trim().slice(0, 60) || v.title;
    if (patch.brief !== undefined) v.brief = patch.brief.slice(0, 1000);
    if (patch.templateId !== undefined) v.templateId = findTemplate(patch.templateId).id;
    if (patch.resolution !== undefined && patch.resolution in VIDEO_USD_PER_SEC) v.resolution = patch.resolution;
    if (patch.sound !== undefined) v.sound = patch.sound === true;
    if (patch.conceptId !== undefined) v.conceptId = v.concepts.some((c) => c.id === patch.conceptId) ? patch.conceptId : null;
    if (patch.shots) {
      const jobs = listJobs(videoId);
      const keep = new Set(patch.shots.map((s) => s.id));
      const removed = v.shots.filter((s) => !keep.has(s.id));
      if (removed.some((s) => jobs.some((j) => j.shotId === s.id && (j.status === "submitting" || j.status === "submitted")))) throw new Error("生成中的镜头不能删除");
      const old = v.shots;
      const next = patch.shots.slice(0, 16).map((s) => cleanShot(s, old.find((p) => p.id === s.id)));
      // 开头被删了，它切镜后的第二段也一起删，不留看不见的镜头
      const kept = next.filter((s) => !s.hook?.partOf || next.some((x) => x.id === s.hook!.partOf));
      v.shots = [...kept.filter((s) => s.hook), ...kept.filter((s) => !s.hook)];
      v.hooksReady = true;
      // 文字改过（或第一次保存）：记下这份文字对应的 3D
      for (const s of v.shots) {
        const p = old.find((x) => x.id === s.id);
        if (p && s.stage === "draft" && opCompKey(parseOp(p.operator)) !== opCompKey(parseOp(s.operator))) s.compFile = null;
        if (!p?.textBasis || TEXT_FIELDS.some((k) => p[k] !== s[k])) s.textBasis = basisOf(s, placeOf(v, s));
      }
    }
    bindScenes(v);
    if (typeof patch.captions === "boolean") v.captions = patch.captions;
    if (patch.exportHooks) v.exportHooks = patch.exportHooks.filter((id) => v.shots.some((s) => s.hook && s.id === id));
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

const HOOK_LIM: Record<TextField, number> = { description: 600, camera: 200, productNote: 300, framePrompt: 2000, motionPrompt: 1000 };

/** 从 Hook 库写开头剧本（DeepSeek 文字调用 1 次，约 $0.01，不出图）；只返回草稿，用户点“采用”才变成开头镜头 */
type HookDraftPart = { draft: Record<TextField, string>; people: HookPerson[]; who: string[] };
export async function draftHookAction(videoId: string, libId: string, values: Record<string, string>, entry: string, selfie = false, who = ""): Promise<Result<HookDraftPart & { caption: string; notes: string[]; second?: HookDraftPart; selfieName?: string; line?: string; lineZh?: string }>> {
  try {
    const v = load(videoId);
    const lib = getHook(libId);
    if (!lib) throw new Error("Hook 不存在");
    const vals = cleanHookValues(lib, values);
    // 除了选填的都必填：模板示例不能当真价格、真卖点
    const empty = lib.fields.filter((f) => !f.optional && !vals[f.key]);
    if (empty.length) throw new Error(`先填：${empty.map((f) => f.label).join("、")}`);
    const en = HOOK_ENTRIES.find((x) => x.id === entry) ?? HOOK_ENTRIES.find((x) => x.id === lib.entry) ?? HOOK_ENTRIES[0];
    const first = v.shots.find((s) => !s.hook);
    const rig = rigOf(v);
    const base = v.shots.find((s) => s.hook) ?? first;
    const stage = lib.stage ?? DEFAULT_STAGE;
    const cast = castOf(v.families, first?.family ?? 1);
    const filmer = filmerId(v, base ?? {});
    const members = cast?.members.filter((m) => m.id !== filmer) ?? [];
    const car = lib.scene === "car";
    const selfiePerson = selfie || car ? (cast?.members.find((m) => m.id === who) ?? selfieMember(cast?.members ?? [], filmer)) : undefined;
    const concept = v.concepts.find((c) => c.id === v.conceptId);
    const k = Math.max(0.5, Math.min(2, (rig?.gripY ?? 0.51) / 0.51));
    const caption = fillCaption(lib.caption, vals, getProduct(v.projectId)?.name ?? "");
    const th = videoTheme(v);
    const { data } = await chatJson({
      system:
        'You write the opening hook shot (the first 2-4 seconds) of a North American TikTok product video. Follow the hook recipe and the filled values exactly. The hook must flow straight into the first body shot (nextShot): same location, same people and family, same product color. The holiday is given in holiday and overrides anything written in nextShot; if it is none, there are no holiday decorations, trees, gifts, bows or holiday outfits at all; otherwise the place clearly shows the typical decorations of that holiday, never write that there are no holiday decorations. Unless selfie is true, the person filming holds the phone and is never visible: never describe them in framePrompt or motionPrompt. If selfie is true, the first shot is a front-camera selfie: selfiePerson holds the phone at arm\'s length and IS in frame (write exactly that person, by name), face and shoulders in the foreground reacting to the lens, with the product visible behind or beside them; describe the filmer in description and framePrompt as in frame (never write that they are not in frame or unseen), with their face on the right side of the frame and the product behind them on the left, but never list the filmer in people. If carScene is true, the first shot happens inside a parked car instead of the usual place: selfiePerson sits in the driver\'s seat with the seat belt on and talks to the front camera; the product is NOT in the first shot at all (never mention or show it in description, productNote, framePrompt or motionPrompt, and people is an empty list); carScene overrides where the product goes in a selfie. The product appears only in the second shot. For carScene never write which side of the frame the face is on and never describe clothes (wardrobe comes from the family data). If productEntry says no box, there is no box, packaging or wrapping anywhere in the frame. First decide who is in frame (people), following the story (story, brief, nextShotPeople) and the hook recipe: pick only from family by memberId, never the filmer; at most 3 people; if only one adult is in frame it is the mom (role mom), unless she is the filmer or the family has no mom; only a child can ride the product and at most one rider; return an empty list only when the story and recipe are clearly better with the product alone. presetPeople is the recipe default and only a suggestion. The program places exactly these people in 3D around the product (side = left, right or behind the product) with exactly these poses, and the camera comes from camera3d. Nobody except the rider touches the product: in 3D the people beside it cannot reach the handlebar, seat or frame, so never write them holding, steadying or touching any part of it (looking at it, pointing at it or cheering is fine). Anyone riding follows rideRule exactly in action, actionEn, description and framePrompt: describe exactly these people doing exactly these poses and actions, and nobody else. Frame it like real phone ads for kid products: the camera is low (about the chest of the child or the handlebar height) and close, the product and child fill most of the frame, almost no empty ground below the wheels, and an adult beside the product is cropped (only legs, hands or waist-down) or crouches at the same height as the product; never a wide shot with an adult standing full-length and the product small at their feet. People behave like an unposed home video: they talk to the filmer, look at the child or the product, or adjust something; they never pose, present the product, make sales gestures or (unless selfie) look into the lens. Refer to each person by their family name and role (for example: Maya, the mom). Never describe the age, ethnicity, hair or clothes (they come from the family data). Never write glints, sparkles, glow, shine or lens flare. Name the product and its color only; never describe its logo, lettering, materials or parts (they come from the product photos). Use only product facts from productFacts; never invent features, prices, parts or packaging. The on-screen caption is fixed and added in editing (caption): write the picture so it supports that caption, and never put text into the image. Values marked showsInPicture must be visible in the picture; the others only live in the caption. Return JSON {"people":[{"memberId":"family 里的 memberId","pose":"stand|crouch|ride|point|reach|hold","onProduct":false,"side":"left|right|behind","action":"中文：这个人在做什么，一句话","actionEn":"the same action in English"}],"description":"中文：画面里有谁、在哪、在做什么、产品怎么出场","camera":"中文：机位和景别","productNote":"中文：产品在画面里的状态","framePrompt":"English first-frame image prompt, concrete and visual, max 900 characters","motionPrompt":"English motion prompt for the clip, max 500 characters","line":"only if selfie is true: the one English sentence selfiePerson says to the camera, like talking to a friend (a reaction, a confession or a question that fits THIS hook recipe: for a price hook react to the deal itself), written fresh for this video, never a stock phrase, max 20 words, never just repeat the caption, only facts from productFacts and the filled values, no holiday unless holiday is set; empty string otherwise","lineZh":"台词的中文意思","notes":["中文提醒，最多 3 条"]}. If secondShot is not null, the hook is two shots joined by a hard cut at hook.seconds: everything above describes the first shot; also return "second" with the same fields (people, description, camera, productNote, framePrompt, motionPrompt) for the shot after the cut, following secondShot.recipe, secondShot.camera3d and secondShot.presetPeople, with the same place, family, product color and holiday, never a selfie; the people rules above apply to it too.',
      user: JSON.stringify({
        hook: { name: lib.name, recipe: lib.about, productEntry: en.en, seconds: lib.seconds },
        selfie: selfie || car,
        carScene: car,
        selfiePerson: selfiePerson ? { name: selfiePerson.name, role: selfiePerson.role, age: selfiePerson.age } : null,
        secondShot: lib.second
          ? { recipe: lib.second.about, seconds: lib.second.seconds, presetPeople: lib.second.stage.people, camera3d: { distanceM: Math.round(lib.second.stage.dist * k * 10) / 10, heightM: lib.second.stage.camH, lensMm: lib.second.stage.lens, product: VIEW_LABEL[lib.second.stage.view] } }
          : null,
        values: lib.fields.map((f) => ({ label: f.label, value: vals[f.key], showsInPicture: f.visual })),
        caption,
        camera3d: { distanceM: Math.round(stage.dist * k * 10) / 10, heightM: stage.camH, lensMm: stage.lens, product: VIEW_LABEL[stage.view] },
        story: concept ? { title: concept.title, people: concept.people, setting: concept.setting, why: concept.why } : null,
        brief: v.brief || "",
        family: members.map((m) => ({ memberId: m.id, name: m.name, role: m.role, age: m.age })),
        filmer: filmer ? (cast?.members.find((m) => m.id === filmer)?.name ?? filmer) : "unnamed",
        presetPeople: stage.people,
        rideRule: rig?.footY !== undefined ? "the rider sits on the saddle, both hands on the handlebar grips, both feet ON the pedals (never dangling, never on the ground)" : "the rider sits on the saddle, both hands on the handlebar grips, feet on the ground",
        nextShotPeople: first?.layout ? figuresOf(first.layout).map((f) => ({ memberId: f.memberId, kind: f.kind, pose: f.pose, onProduct: f.onProduct, action: f.action })) : [],
        holiday: th.theme && th.theme !== "none" ? th.themeText || th.theme : "none",
        productFacts: productText(v.projectId),
        nextShot: first ? { beat: first.beat, ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, first[k]])) } : null,
      }),
      maxTokens: lib.second ? 5000 : 3000,
      thinking: false,
      timeoutMs: 180_000,
    });
    const d = (data ?? {}) as Record<string, unknown>;
    const textOf = (o: Record<string, unknown>) => Object.fromEntries(TEXT_FIELDS.map((k) => [k, typeof o[k] === "string" ? String(o[k]).trim().replace(/^English:\s*/i, "").slice(0, HOOK_LIM[k]) : ""])) as Record<TextField, string>;
    const draft = textOf(d);
    if (!draft.description || !draft.framePrompt) throw new AiError("AI 没有写出剧本，请重试");
    const { people: rawPeople, dropped, renames } = cleanHookPeople(d.people, cast?.members, filmer);
    const notes = Array.isArray(d.notes) ? d.notes.filter((n): n is string => typeof n === "string" && !!n.trim()).slice(0, 3).map((n) => renameText(n, renames)) : [];
    const fixNames = (t: Partial<Record<TextField, string>>, r: [string, string][]) => {
      if (r.length) for (const k of Object.keys(t) as TextField[]) if (typeof t[k] === "string") t[k] = renameText(t[k]!, r);
    };
    fixNames(draft, renames);
    const people = car ? [] : selfiePerson ? rawPeople.filter((x) => x.memberId !== selfiePerson.id) : rawPeople;
    let second: HookDraftPart | undefined;
    if (lib.second) {
      const d2 = (d.second && typeof d.second === "object" ? d.second : {}) as Record<string, unknown>;
      const draft2 = textOf(d2);
      if (!draft2.description || !draft2.framePrompt) throw new AiError("AI 没写切镜后的第二段，请重试");
      const p2 = cleanHookPeople(d2.people, cast?.members, filmer);
      fixNames(draft2, [...renames, ...p2.renames]);
      dropped.push(...p2.dropped.map((x) => `第二段：${x}`));
      second = { draft: draft2, people: p2.people, who: peopleText(p2.people, cast?.members) };
    }
    return { result: { draft, caption, notes: [...dropped, ...notes].slice(0, 5), people, who: peopleText(people, cast?.members), second, selfieName: selfiePerson?.name, line: selfiePerson ? str(d.line, 200).trim().replace(/^"|"$/g, "") : "", lineZh: selfiePerson ? str(d.lineZh, 200).trim() : "" } };
  } catch (e) {
    return fail(e);
  }
}

/** 采用 Hook 剧本：新建开头（或重写 replaceId 这个开头）。3D 摆位先抄第一个开头，家庭和场地跟正文第一镜（免费） */
export async function adoptHookAction(videoId: string, libId: string, values: Record<string, string>, entry: string, draft: Partial<Record<TextField, string>>, replaceId?: string, people?: unknown, opts?: { selfie?: boolean; line?: string; who?: string; second?: { draft: Partial<Record<TextField, string>>; people?: unknown } }): Promise<Result<StudioState & { shotId: string; secondId?: string; fixed?: string[] }>> {
  try {
    const v = load(videoId);
    const lib = getHook(libId);
    if (!lib) throw new Error("Hook 不存在");
    const vals = cleanHookValues(lib, values);
    const hooks = v.shots.filter((s) => s.hook);
    const body = v.shots.filter((s) => !s.hook);
    const old = replaceId ? hooks.find((s) => s.id === replaceId) : undefined;
    if (replaceId && !old) throw new Error("开头不存在");
    if (old && old.stage !== "draft") throw new Error("这个开头构图已确认：要重写剧本先点“退回构图”");
    if (!old && v.shots.length >= 16) throw new Error("镜头太多了（最多 16 个）");
    const text = Object.fromEntries(TEXT_FIELDS.map((k) => [k, str(draft[k], HOOK_LIM[k]).trim()])) as Record<TextField, string>;
    if (!text.description || !text.framePrompt) throw new Error("剧本是空的：先生成剧本");
    const base = old ?? hooks[0] ?? body[0];
    const link = body[0] ?? base;
    const hook: ShotHook = {
      name: old?.hook?.libId === lib.id ? (old.hook.name ?? lib.name) : lib.name,
      libId: lib.id,
      libName: lib.name,
      values: vals,
      entry: HOOK_ENTRIES.some((x) => x.id === entry) ? entry : lib.entry,
      captionTpl: lib.caption,
      visualKeys: lib.fields.filter((f) => f.visual).map((f) => f.key),
      effect: lib.effect,
      ...(lib.scene === "car" || (opts ? opts.selfie : old?.hook?.selfie) ? { selfie: true, line: str(opts ? opts.line : old?.hook?.line, 200).trim(), ...(lib.scene === "car" ? { scene: "car" as const } : {}), ...((opts?.who ?? old?.hook?.who) ? { who: str(opts?.who ?? old?.hook?.who, 60) } : {}) } : {}),
    };
    const caption = fillCaption(lib.caption, vals, getProduct(v.projectId)?.name ?? "");
    const s = old
      ? cleanShot({ ...old, ...text, hook, caption }, old)
      : cleanShot({ ...(base ?? {}), ...text, id: undefined, hook, caption, beat: "开头", useSeconds: lib.seconds, trimStart: 0, checkNote: "" });
    // 重写剧本：旧首帧 / 视频和新文字对不上，从卡片上摘掉（生成记录还在历史里）
    s.frameJobId = null;
    s.frameCheck = undefined;
    s.videoJobId = null;
    s.trimStart = 0;
    if (!old) {
      s.layout = base?.layout ?? null;
      s.scene = link?.scene ? { ...link.scene } : undefined;
      s.family = link?.family;
      s.special = base?.special;
      v.shots = [...hooks, s, ...body];
    } else v.shots = v.shots.map((x) => (x.id === old.id ? s : x));
    const stage = lib.stage ?? DEFAULT_STAGE;
    let crew = people === undefined ? stage.people : cleanHookPeople(people, castOf(v.families, s.family ?? 1)?.members, filmerId(v, s)).people;
    const me = hook.selfie ? selfieMe(v, s, crew) : null;
    if (me) crew = crew.filter((c) => !me.memberId || c.memberId !== me.memberId);
    // 车里自拍：第一段不用 3D（产品不入镜，3D 里也没有汽车内饰）
    s.layout = hook.scene === "car" ? null : buildHookLayout({ ...stage, people: crew }, (old ?? base)?.layout, rigOf(v)?.gripY ?? 0.51);
    if (me && s.layout) s.layout = applySelfie(s.layout, stage.view, rigOf(v)?.gripY ?? 0.51, me);
    s.useSeconds = lib.seconds;
    const fixed = s.layout ? fitFigureActions(s.layout, rigOf(v)) : [];
    // Hook 的机位高度定了拍摄者姿势：0.9 米就是蹲着拍，不能还写站着
    const fitOp = (x: ShortShot, camH: number) => {
      const op = parseOp(x.operator);
      const ok = (id: typeof op.pose) => camH >= poseOf(id).lo && camH <= poseOf(id).hi;
      const fit = OP_POSES.find((y) => ok(y.id));
      if (!op.custom && fit && !ok(op.pose)) x.operator = opString({ ...op, pose: fit.id });
    };
    fitOp(s, me ? (s.layout?.camPos?.[2] ?? stage.camH) : stage.camH);
    s.compFile = null;
    // 切镜后的第二段：单独一镜（自己的 3D、首帧、视频），换 Hook 时旧的第二段一起换掉
    const oldParts = v.shots.filter((x) => x.hook?.partOf === s.id);
    if (oldParts.some((x) => x.stage !== "draft")) throw new Error("切镜后的第二段构图已确认：先把它退回构图");
    v.shots = v.shots.filter((x) => x.hook?.partOf !== s.id);
    let s2: ShortShot | undefined;
    if (lib.second) {
      const t2 = Object.fromEntries(TEXT_FIELDS.map((k) => [k, str(opts?.second?.draft?.[k], HOOK_LIM[k]).trim()])) as Record<TextField, string>;
      if (!t2.description || !t2.framePrompt) throw new Error("切镜后的第二段剧本是空的：重新生成剧本");
      const prev = oldParts[0];
      s2 = cleanShot({ ...(prev ?? {}), ...t2, id: prev?.id, hook: { name: `${hook.name} · 切镜后`, partOf: s.id }, caption: "", beat: "开头切镜后", useSeconds: lib.second.seconds, operator: s.operator, checkNote: "" }, prev);
      s2.scene = s.scene ? { ...s.scene } : undefined;
      s2.family = s.family;
      s2.special = s.special;
      const crew2 = cleanHookPeople(opts?.second?.people ?? lib.second.stage.people, castOf(v.families, s2.family ?? 1)?.members, filmerId(v, s2)).people;
      s2.layout = buildHookLayout({ ...lib.second.stage, people: crew2 }, s.layout ?? (old ?? base)?.layout, rigOf(v)?.gripY ?? 0.51);
      fixed.push(...fitFigureActions(s2.layout, rigOf(v)).map((x) => `第二段：${x}`));
      fitOp(s2, lib.second.stage.camH);
      s2.compFile = null;
      v.shots.splice(v.shots.indexOf(s) + 1, 0, s2);
    }
    bindScenes(v);
    s.textBasis = basisOf(s, placeOf(v, s));
    if (s2) s2.textBasis = basisOf(s2, placeOf(v, s2));
    v.hooksReady = true;
    saveShortVideo(v);
    refresh(v);
    return { result: { ...state(videoId), shotId: s.id, secondId: s2?.id, fixed } };
  } catch (e) {
    return fail(e);
  }
}

/** 改开头的 Hook 属性：只进字幕的直接改字幕（免费）；影响画面的、画面已经做过，先列出费用让用户确认，再退回构图 */
/** 自拍开头：拿手机的人入镜说台词，强制开声音。改自拍要先退回构图（画面里多了一个人）；只改台词随时可以 */
export async function setHookSelfieAction(videoId: string, shotId: string, selfie: boolean, line: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s?.hook) throw new Error("开头不存在");
    if (!selfie && s.hook.scene === "car") throw new Error("车里自拍必须是自拍");
    if (Boolean(s.hook.selfie) !== selfie && (s.stage !== "draft" || s.frameJobId)) throw new Error("这个开头已经出过首帧或确认了构图：要改自拍，先点“退回构图”");
    if (listJobs(videoId).some((j) => j.shotId === s.id && (j.status === "submitting" || j.status === "submitted"))) throw new Error("这个开头正在生成，等生成完再改");
    const { selfie: _s, line: _l, ...rest } = s.hook;
    void _s;
    void _l;
    const toggled = Boolean(s.hook.selfie) !== selfie;
    s.hook = selfie ? { ...rest, selfie: true, line: str(line, 200).trim() } : rest;
    // 3D 跟着改：开自拍 = 拿手机的人摆到镜头前；关自拍 = 去掉他，摄影机回到 Hook 预设机位
    if (toggled && s.layout) {
      const stage = (s.hook.libId ? getHook(s.hook.libId)?.stage : undefined) ?? DEFAULT_STAGE;
      const grip = rigOf(v)?.gripY ?? 0.51;
      if (selfie) s.layout = applySelfie(s.layout, stage.view, grip, selfieMe(v, s, []));
      else {
        const cam = buildHookLayout({ ...stage, people: [] }, s.layout, grip);
        s.layout = { ...s.layout, lens: cam.lens, camPos: cam.camPos, lookAt: cam.lookAt, figures: (s.layout.figures ?? []).filter((f) => f.id !== "self"), source: cam.source };
      }
      s.compFile = null;
    }
    saveShortVideo(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 运镜在「生成视频」旁边选：只影响视频提示词，不动 3D 构图和首帧，任何阶段都能改（生成中除外） */
export async function setShotMoveAction(videoId: string, shotId: string, kind: string, amount: number): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    if (!s.layout) throw new Error("这一镜还没有 3D 机位：先在 3D 里摆好");
    const ok: SetMove["kind"][] = s.hook?.selfie ? ["static", "handheld"] : ["static", "handheld", "push", "pull", "orbitL", "orbitR", "rise", "lower"];
    if (!ok.includes(kind as SetMove["kind"])) throw new Error(s.hook?.selfie ? "自拍镜头只能固定或手持微晃" : "运镜不存在");
    if (listJobs(videoId).some((j) => j.shotId === s.id && (j.status === "submitting" || j.status === "submitted"))) throw new Error("这一镜正在生成，等生成完再改");
    s.layout = { ...s.layout, move: { kind: kind as SetMove["kind"], amount: Math.min(1, Math.max(0.1, Number(amount) || 0.5)) } };
    saveShortVideo(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 自拍出镜的人：从这条视频的家庭成员里选（写剧本、摆 3D、出图、看图检查都用这个人） */
export async function setHookWhoAction(videoId: string, shotId: string, memberId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s?.hook?.selfie) throw new Error("先勾上自拍");
    if (s.stage !== "draft") throw new Error("这个开头已经确认了构图：要换人，先点“退回构图”");
    if (listJobs(videoId).some((j) => j.shotId === s.id && (j.status === "submitting" || j.status === "submitted"))) throw new Error("这个开头正在生成，等生成完再改");
    const members = castOf(v.families, s.family ?? 1)?.members ?? [];
    const m = memberId ? members.find((x) => x.id === memberId) : undefined;
    if (memberId && !m) throw new Error("家里没有这个人");
    const { who: _w, ...rest } = s.hook;
    void _w;
    s.hook = m ? { ...rest, who: m.id } : rest;
    if (s.layout?.figures?.some((f) => f.id === "self")) {
      const me = selfieMe(v, s, []);
      s.layout = { ...s.layout, figures: s.layout.figures.map((f) => (f.id === "self" ? { ...f, memberId: me.memberId } : f)) };
      s.compFile = null;
    }
    saveShortVideo(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

export async function setHookValuesAction(videoId: string, shotId: string, values: Record<string, string>, confirmed = false): Promise<Result<{ confirm?: string; state?: StudioState; rewrite?: boolean }>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    const h = s?.hook;
    if (!s || !h?.libId) throw new Error("这个开头不是从 Hook 库来的");
    const vals = Object.fromEntries(Object.keys(h.values ?? {}).map((k) => [k, str(values[k] ?? h.values?.[k], 200).trim()]));
    const changed = Object.keys(vals).filter((k) => vals[k] !== h.values?.[k]);
    if (!changed.length) return { result: { state: state(videoId) } };
    if (listJobs(videoId).some((j) => j.shotId === s.id && (j.status === "submitting" || j.status === "submitted"))) throw new Error("这个开头正在生成，等生成完再改");
    const visual = changed.filter((k) => h.visualKeys?.includes(k));
    const made = s.stage !== "draft" || !!s.frameJobId || !!s.videoJobId;
    if (visual.length && s.stage === "accepted") throw new Error("这个开头已采用：要改影响画面的属性，先点“退回返工”");
    if (visual.length && made && !confirmed) {
      const lib = getHook(h.libId);
      const names = visual.map((k) => lib?.fields.find((f) => f.key === k)?.label ?? k).join("、");
      const usd = FRAME_USD_FALLBACK + (s.videoJobId ? Math.max(VIDEO_MIN_SEC, s.genSeconds) * videoUsdPerSec(s, v.resolution) : 0);
      return { result: { confirm: `改了影响画面的属性（${names}），开头「${h.name}」已经做过的画面要退回构图、重写剧本再重做：\n剧本 DeepSeek 约 $0.01 + 重做大约 $${usd.toFixed(2)}（每次生成照样先审批）。已经生成的画面会留在历史里。` } };
    }
    s.hook = { ...h, values: vals };
    if (h.captionTpl) s.caption = fillCaption(h.captionTpl, vals, getProduct(v.projectId)?.name ?? "");
    if (visual.length && made) s.stage = "draft";
    saveShortVideo(v);
    refresh(v);
    return { result: { state: state(videoId), rewrite: visual.length > 0 } };
  } catch (e) {
    return fail(e);
  }
}

/** 把改好属性的开头另存成 Hook 库里的新 Hook（示例值换成这条视频填的值，免费） */
export async function saveHookAsLibAction(videoId: string, shotId: string, name: string): Promise<Result<string>> {
  try {
    const v = load(videoId);
    const h = v.shots.find((x) => x.id === shotId)?.hook;
    const lib = h?.libId ? getHook(h.libId) : null;
    if (!h || !lib) throw new Error("这个开头的 Hook 已经不在库里了");
    const nm = str(name, 40).trim();
    if (!nm) throw new Error("名字不能为空");
    const entry = HOOK_ENTRIES.find((x) => x.id === h.entry)?.id ?? lib.entry;
    return { result: createHook({ name: nm, about: lib.about, use: lib.use, seconds: lib.seconds, entry, caption: lib.caption, fields: lib.fields.map((f) => ({ ...f, example: h.values?.[f.key] || f.example })), stage: lib.stage, effect: lib.effect, second: lib.second ?? null, selfie: Boolean(h.selfie) }) };
  } catch (e) {
    return fail(e);
  }
}

/** 删除一个开头（已采用、正在生成的不能删；生成过的画面留在历史里） */
export async function deleteHookShotAction(videoId: string, shotId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s?.hook) throw new Error("只能删除开头镜头");
    // 删开头连切镜后的第二段一起删
    const gone = s.hook.partOf ? [s] : hookParts(v, s);
    if (gone.some((x) => x.stage === "accepted")) throw new Error("这个开头已采用：先点“退回返工”再删");
    if (listJobs(videoId).some((j) => gone.some((x) => x.id === j.shotId) && (j.status === "submitting" || j.status === "submitted"))) throw new Error("这个开头正在生成，等生成完再删");
    v.shots = v.shots.filter((x) => !gone.includes(x));
    v.exportHooks = (v.exportHooks ?? []).filter((x) => x !== shotId);
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 新建一个开头：文字和 3D 摆位先抄第一个开头，家庭和场地跟正文第一镜，保证接得上（免费） */
export async function addHookAction(videoId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const hooks = hooksOf(v);
    const body = v.shots.filter((s) => !s.hook);
    if (v.shots.length >= 16) throw new Error("镜头太多了（最多 16 个）");
    const base = hooks[0] ?? body[0];
    const link = body[0] ?? base;
    // 照抄：Hook 的效果、属性、自拍和切镜后的第二段一起抄；生成记录不抄
    const fresh = { frameJobId: null, videoJobId: null, frameCheck: undefined, videoCheck: undefined, compFile: null } as const;
    const s = cleanShot({ ...(base ?? {}), id: undefined, hook: { ...(base?.hook ?? {}), name: `开头 ${hooks.length + 1}`, partOf: undefined }, beat: "开头", checkNote: "" });
    Object.assign(s, fresh);
    s.layout = base?.layout ?? null;
    s.scene = link?.scene ? { ...link.scene } : undefined;
    s.family = link?.family;
    s.special = base?.special;
    const parts = base?.hook ? v.shots.filter((x) => x.hook?.partOf === base.id) : [];
    const copies = parts.map((p) => {
      const c = cleanShot({ ...p, id: undefined, hook: { ...p.hook!, name: `${s.hook!.name} · 切镜后`, partOf: s.id }, checkNote: "" });
      Object.assign(c, fresh);
      c.layout = p.layout;
      c.scene = p.scene ? { ...p.scene } : undefined;
      c.family = p.family;
      c.special = p.special;
      return c;
    });
    if (v.shots.length + 1 + copies.length > 16) throw new Error("镜头太多了（最多 16 个）");
    v.shots = [...v.shots.filter((x) => x.hook), s, ...copies, ...body];
    bindScenes(v);
    for (const x of [s, ...copies]) x.textBasis = basisOf(x, placeOf(v, x));
    v.hooksReady = true;
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 没绑场地的镜头：按 room 绑到场地库最新版本，节日跟整条视频 */
const hashOf = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(a: T[], seed: number) => a[seed % a.length];
const OUT_SPOTS = ["the front porch steps", "the garage side of the driveway", "the sidewalk in front of the house", "the side yard by the fence", "the end of the driveway near the mailbox"];
const OUT_EXTRAS = ["a parked gray SUV", "a blue recycling bin", "a kid's scooter lying on the lawn", "chalk drawings on the concrete", "a garden hose coiled by the wall", "fallen leaves along the edge", "a basketball hoop by the garage", "potted plants by the door"];
const IN_SPOTS = ["the hallway by the front door", "the corner by the sofa", "near the kitchen island", "by the big window"];
const IN_EXTRAS = ["a laundry basket", "a few toy blocks on the floor", "a throw blanket on the sofa", "shoes by the door", "a kid's drawing taped to the wall", "a backpack on a chair"];
const LIGHTS = ["overcast soft daylight", "late afternoon sun with long soft shadows", "bright midday light", "cool early morning light"];
/** 每条视频换光线和杂物，每个开头换同一个家里的不同角落：背景不再每次一样，看着也更像真实生活 */
function sceneVariation(v: ShortVideo, s: ShortShot, outdoor: boolean): string {
  const vs = hashOf(v.id);
  const hs = s.hook ? hashOf(s.hook.partOf ?? s.id) : vs;
  const extras = outdoor ? OUT_EXTRAS : IN_EXTRAS;
  const a = pick(extras, hs), b = pick(extras.filter((x) => x !== a), hs >>> 3);
  const spot = s.hook && isExtraHook(v, s) ? ` This opening is filmed at ${pick(outdoor ? OUT_SPOTS : IN_SPOTS, hs >>> 5)} of the same home.` : "";
  return `Set dressing (ordinary and lived-in, not staged): ${outdoor ? `${pick(LIGHTS, vs)} (overrides any light described later), ` : ""}also visible: ${a}, ${b}.${spot}`;
}

function bindScenes(v: ShortVideo) {
  if (v.shots.every((s) => s.scene)) return;
  const { theme, themeText } = videoTheme(v);
  const scenes = ensureScenes(v.projectId, listShortVideos(v.projectId));
  const base = getScene(legacyShotScene(scenes, v.room).id);
  // 同类（室内 / 户外）场地里按视频随机挑一个：每条视频背景不一样
  const same = base ? scenes.filter((x) => x.outdoor === base.outdoor) : [];
  const sc = same.length ? getScene(pick(same, hashOf(v.id)).id) : base;
  if (!sc) return;
  for (const s of v.shots) if (!s.scene) s.scene = themedScene(sc, sc.versions[sc.versions.length - 1].v, theme, themeText);
}

/** 换整条视频的节日：做过的镜头先列出来让用户确认（退回构图重做），已采用的镜头不自动改 */
/** 换某个家庭位用哪家：已采用的镜头拦下；做过的镜头先列出要重做的和费用，确认后退回构图。人偶的成员绑定清掉 */
export async function setVideoFamilyAction(videoId: string, slot: number, familyId: string | null, confirmed = false): Promise<Result<{ confirm?: string; state?: StudioState }>> {
  try {
    const v = load(videoId);
    const k = String(Math.max(1, Math.min(9, Math.round(slot))));
    if (familyId && !getFamily(familyId)) throw new Error("家庭不存在");
    if ((v.families?.[k] ?? null) === familyId) return { result: { state: state(videoId) } };
    if (listJobs(videoId).some((j) => j.status === "submitting" || j.status === "submitted")) throw new Error("有镜头正在生成，等生成完再换家庭");
    const label = (s: ShortShot) => (s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1}`);
    const changed = v.shots.filter((s) => famOf(s) === Number(k));
    const accepted = changed.filter((s) => s.stage === "accepted");
    if (accepted.length) throw new Error(`已采用的镜头 ${accepted.map(label).join("、")} 不会被自动改：要换家庭，先在这些镜头点“退回返工”`);
    const redo = changed.filter((s) => s.stage !== "draft" || s.frameJobId || s.videoJobId);
    if (redo.length && !confirmed) {
      const usd = redo.reduce((a, s) => a + FRAME_USD_FALLBACK + (s.videoJobId ? Math.max(VIDEO_MIN_SEC, s.genSeconds) * videoUsdPerSec(s, v.resolution) : 0), 0);
      const to = familyId ? getFamily(familyId)!.name : "不指定";
      return { result: { confirm: `家庭位 ${k} 换成「${to}」以后，这些已经做过的镜头画面里还是原来的人，要退回构图重做：\n${redo.map(label).join("、")}\n\n重做大约 $${usd.toFixed(2)}（每次生成照样先审批）。已经生成的画面会留在历史里。` } };
    }
    for (const s of changed) {
      if (s.layout?.figures) s.layout.figures = s.layout.figures.map(({ memberId: _m, h: _h, ...f }) => (void _m, void _h, f));
      if (redo.includes(s)) {
        s.compFile = null;
        s.stage = "draft";
      }
    }
    if (k === "1") v.filmer = undefined;
    for (const s of changed) s.filmer = undefined;
    const fams = { ...(v.families ?? {}) };
    if (familyId) fams[k] = familyId;
    else delete fams[k];
    v.families = Object.keys(fams).length ? fams : undefined;
    saveShortVideo(v);
    refresh(v);
    return { result: { state: state(videoId) } };
  } catch (e) {
    return fail(e);
  }
}

/** 整条视频谁拿手机（家庭位 1 的成员）：做过的镜头先列出来让用户确认，已采用的不自动改 */
export async function setVideoFilmerAction(videoId: string, memberId: string | null, confirmed = false): Promise<Result<{ confirm?: string; state?: StudioState }>> {
  try {
    const v = load(videoId);
    const id = memberId || undefined;
    if (v.filmer === id) return { result: { state: state(videoId) } };
    const who = id ? castOf(v.families, 1)?.members.find((m) => m.id === id) : undefined;
    if (id && !who) throw new Error("这个人不在这条视频的家庭里");
    if (listJobs(videoId).some((j) => j.status === "submitting" || j.status === "submitted")) throw new Error("有镜头正在生成，等生成完再换拍摄者");
    const label = (s: ShortShot) => (s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1}`);
    const changed = v.shots.filter((s) => s.filmer === undefined);
    const accepted = changed.filter((s) => s.stage === "accepted");
    if (accepted.length) throw new Error(`已采用的镜头 ${accepted.map(label).join("、")} 不会被自动改：要换拍摄者，先在这些镜头点“退回返工”`);
    const redo = changed.filter((s) => s.stage !== "draft" || s.frameJobId || s.videoJobId);
    if (redo.length && !confirmed) {
      const usd = redo.reduce((a, s) => a + FRAME_USD_FALLBACK + (s.videoJobId ? Math.max(VIDEO_MIN_SEC, s.genSeconds) * videoUsdPerSec(s, v.resolution) : 0), 0);
      return { result: { confirm: `拿手机的人换成「${who?.name ?? "不指定"}」以后，这些已经做过的镜头里露出的手、衣服和拍摄高度还是原来的，要退回构图重做：\n${redo.map(label).join("、")}\n\n重做大约 $${usd.toFixed(2)}（每次生成照样先审批）。已经生成的画面会留在历史里。` } };
    }
    for (const s of redo) {
      s.compFile = null;
      s.stage = "draft";
    }
    v.filmer = id;
    saveShortVideo(v);
    refresh(v);
    return { result: { state: state(videoId) } };
  } catch (e) {
    return fail(e);
  }
}

/** 这一镜单独换拿手机的人（"" = 跟视频，"none" = 不指定）；只能改构图草案 */
export async function setShotFilmerAction(videoId: string, shotId: string, filmer: string): Promise<{ error?: string }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    const f = filmer.trim();
    if (f && f !== "none" && !castOf(v.families, famOf(s))?.members.some((m) => m.id === f)) throw new Error("这个人不在这一镜的家庭里");
    s.filmer = f || undefined;
    saveShortVideo(v);
    refresh(v);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function setVideoThemeAction(videoId: string, theme: string, themeText = "", confirmed = false): Promise<Result<{ confirm?: string; state?: StudioState }>> {
  try {
    const v = load(videoId);
    const t = findTheme(theme).id;
    const text = t === "custom" ? themeText.trim().slice(0, 300) : "";
    if (t === "custom" && !text) throw new Error("自定义节日要写清楚是什么节日，例如：中秋节，挂灯笼、桌上有月饼");
    if (listJobs(videoId).some((j) => j.status === "submitting" || j.status === "submitted")) throw new Error("有镜头正在生成，等生成完再换节日");
    const scenes = ensureScenes(v.projectId, listShortVideos(v.projectId));
    const cur = videoTheme(v);
    const label = (s: ShortShot) => (s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1}`);
    const shOf = (s: ShortShot) => s.scene ?? legacyShotScene(scenes, v.room, cur.theme);
    const changed = v.shots.filter((s) => {
      const sh = shOf(s);
      return sh.theme !== t || (t === "custom" && (sh.themeText ?? "") !== text);
    });
    const accepted = changed.filter((s) => s.stage === "accepted");
    if (accepted.length) throw new Error(`已采用的镜头 ${accepted.map(label).join("、")} 不会被自动改：要换节日，先在这些镜头点“退回返工”`);
    const redo = changed.filter((s) => s.stage !== "draft" || s.frameJobId || s.videoJobId);
    if (redo.length && !confirmed) {
      const usd = redo.reduce((a, s) => a + FRAME_USD_FALLBACK + (s.videoJobId ? Math.max(VIDEO_MIN_SEC, s.genSeconds) * videoUsdPerSec(s, v.resolution) : 0), 0);
      return {
        result: {
          confirm: `换成「${findTheme(t).label}」以后，这些已经做过的镜头画面里还是旧节日，要退回构图重做：\n${redo.map(label).join("、")}\n\n重做大约 $${usd.toFixed(2)}（每次生成照样先审批）。已经生成的图和视频会留在历史里。\n\n确定要换吗？`,
        },
      };
    }
    const memo = new Map<string, ReturnType<typeof themedScene>>();
    for (const s of changed) {
      const sh = shOf(s);
      const key = `${sh.id}:${sh.v}`;
      let next = memo.get(key);
      if (!next) {
        const sc = getScene(sh.id);
        if (!sc) continue;
        next = themedScene(sc, sh.v, t, text);
        memo.set(key, next);
      }
      s.scene = { ...next };
      s.compFile = null;
      s.stage = "draft";
    }
    v.theme = t;
    v.themeText = text || undefined;
    saveShortVideo(v);
    refresh(v);
    return { result: { state: state(videoId) } };
  } catch (e) {
    return fail(e);
  }
}

/** 用户主动调整预算；不能低于已花费 */
export async function setBudgetAction(videoId: string, usd: number | null): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const spent = listJobs(videoId)
      .filter((j) => !j.isTest)
      .reduce((s, j) => s + (j.status === "failed" ? 0 : (j.actualUsd ?? j.estUsd)), 0);
    if (usd !== null && (!Number.isFinite(usd) || usd < spent)) throw new Error(`预算不能低于已花费 $${spent.toFixed(2)}`);
    v.budgetUsd = usd === null ? null : Math.round(usd * 100) / 100;
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

const CJK = /[\u3400-\u9fff]/;

/** 字幕必须是英文（面向北美）；AI 偶尔会写成中文，发现就再翻译一次 */
async function ensureEnglish(texts: string[]): Promise<string[]> {
  const idx = texts.map((t, i) => (CJK.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return texts;
  const { data } = await chatJson({
    system: "You write on-screen captions for North American TikTok product videos. Translate each caption into short, natural, casual American English (max 12 words). Keep any 'POV:' prefix and any quoted comment keyword. Output json: {\"captions\":[\"...\"]} in the same order.",
    user: JSON.stringify(idx.map((i) => texts[i])),
    maxTokens: 2000,
    thinking: false,
    timeoutMs: 120_000,
  });
  const out = (data as { captions?: unknown[] })?.captions;
  const next = [...texts];
  idx.forEach((i, k) => {
    const t = Array.isArray(out) && typeof out[k] === "string" ? (out[k] as string).slice(0, 160) : "";
    if (t && !CJK.test(t)) next[i] = t;
  });
  return next;
}

export async function aiConceptsAction(videoId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    requirePackaging(v.projectId, v.templateId);
    const t = findTemplate(v.templateId);
    const others = listShortVideos(v.projectId)
      .filter((x) => x.id !== v.id)
      .flatMap((x) => x.concepts.filter((c) => c.id === x.conceptId).map((c) => `${c.title}（${c.hookCaption}）`));
    const { system, user } = shortConceptPrompt(t, productText(v.projectId), v.brief, others);
    const { data } = await chatJson({ system, user, maxTokens: 8000, thinking: false, timeoutMs: 180_000 });
    const list = (data as { concepts?: Partial<ShortConcept>[] })?.concepts;
    if (!Array.isArray(list) || !list.length) throw new AiError("AI 没有返回创意，请重试");
    v.concepts = list.slice(0, 5).map((c) => ({
      id: randomUUID().slice(0, 8),
      title: str(c.title, 60),
      hookCaption: str(c.hookCaption, 160),
      ctaCaption: str(c.ctaCaption, 160),
      audience: str(c.audience, 200),
      setting: str(c.setting, 300),
      people: str(c.people, 400),
      why: str(c.why, 300),
    }));
    const caps = await ensureEnglish(v.concepts.flatMap((c) => [c.hookCaption, c.ctaCaption]));
    v.concepts.forEach((c, i) => {
      c.hookCaption = caps[i * 2];
      c.ctaCaption = caps[i * 2 + 1];
    });
    v.conceptId = null;
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

export async function aiShotsAction(videoId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const c = v.concepts.find((x) => x.id === v.conceptId);
    if (!c) throw new Error("先选一个创意");
    requirePackaging(v.projectId, v.templateId);
    const jobs = listJobs(videoId);
    if (jobs.some((j) => j.status !== "failed")) throw new Error("这条视频已经花过钱，重新生成分镜会让已生成素材作废；请新建一条视频");
    const t = findTemplate(v.templateId);
    const { system, user } = shortShotsPrompt(t, productText(v.projectId), c, v.resolution, t.look);
    const { data } = await chatJson({ system, user, maxTokens: 12_000, thinking: false, timeoutMs: 240_000 });
    const list = (data as { shots?: Partial<ShortShot>[] })?.shots;
    if (!Array.isArray(list) || !list.length) throw new AiError("AI 没有返回分镜，请重试");
    v.shots = list.slice(0, 8).map((s, i) => cleanShot({ ...s, id: undefined, hook: i === 0 ? { name: "原版" } : undefined }));
    v.shots.forEach((s, i) => {
      if (i > 0 && !s.operator) s.operator = defaultOperator(s, i);
    });
    v.hooksReady = true;
    v.exportHooks = [];
    const caps = await ensureEnglish(v.shots.map((s) => s.caption));
    v.shots.forEach((s, i) => (s.caption = caps[i]));
    v.room = guessRoom(c.setting);
    bindScenes(v);
    v.budgetUsd = null;
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 对照新旧版本后标记返工问题：只有出了新版本才能标 */
export async function issueStatusAction(videoId: string, shotId: string, issueId: string, status: "open" | "fixed"): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    const it = s?.issues?.find((x) => x.id === issueId);
    if (!s || !it) throw new Error("问题不存在");
    if (s.stage !== "video_ready" || !s.videoJobId || s.videoJobId === it.fromJobId) throw new Error("要等新版视频出来，和旧版对照后再标");
    it.status = status;
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 返工问题的范围：只管这一镜 / 整条视频都要注意。免费，不改镜头状态 */
export async function issueScopeAction(videoId: string, shotId: string, issueId: string, scope: "shot" | "video"): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    const it = s?.issues?.find((x) => x.id === issueId);
    if (!s || !it) throw new Error("问题不存在");
    if ((it.scope ?? "shot") === scope) return { result: state(videoId) };
    it.scope = scope;
    if (scope === "video") addRule(v.projectId, { layer: "process", level: "warn", text: `短视频返工问题（整条视频都要注意）：${it.text}`, source: `${v.title} #${v.shots.indexOf(s) + 1}` });
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

export type StageAction = "confirm_comp" | "reopen_comp" | "frame_ok" | "frame_ok_force" | "frame_reject" | "accept" | "accept_force" | "rework";

/** 关口动作：只有这里能改变镜头的关口状态 */
export async function shotStageAction(videoId: string, shotId: string, action: StageAction, note = "", issueScope: "shot" | "video" = "shot"): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    const busy = listJobs(videoId).some((j) => j.shotId === shotId && (j.status === "submitting" || j.status === "submitted"));
    if (busy) throw new Error("本镜有任务在生成中");
    const need = (ok: boolean, msg: string) => {
      if (!ok) throw new Error(msg);
    };
    switch (action) {
      case "confirm_comp":
        need(s.stage === "draft", "构图已确认过");
        need(!waitingFor(v, s.id), `按顺序做：先把 #${waitingFor(v, s.id)} 做到“采用”`);
        need(s.framePrompt.trim().length > 20 && s.description.trim().length > 0, "构图描述和首帧提示词还没写好");
        need(!opMissing(s.operator), "拍摄者：勾了“空着的手入镜”，要先选动作");
        need(!!s.hook?.selfie || !filmerId(v, s) || !(s.layout?.figures ?? []).some((f) => f.memberId === filmerId(v, s)), "拿手机的人不能同时出现在画面里：换一个人拍，或者把这个人偶换成别人");
        need(s.hook?.scene === "car" || (!!s.layout && !!s.compFile && fs.existsSync(path.join(videoDir(v.projectId, v.id), s.compFile))), "先在 3D 布景里摆好机位，并保存 3D 构图");
        s.stage = "comp_ok";
        break;
      case "reopen_comp":
        need(s.stage !== "accepted", "已采用的镜头请先退回返工");
        s.stage = "draft";
        break;
      case "frame_ok":
      case "frame_ok_force": {
        need(s.stage === "frame_ready" && !!s.frameJobId, "还没有待检查的首帧");
        const fc = s.frameCheck?.jobId === s.frameJobId ? s.frameCheck : undefined;
        need(action === "frame_ok_force" || !fc || fc.pass || !!fc.failed, `看图检查没过：${fc?.issues.join("；")}。确认没问题请点“我看过了，仍然通过”`);
        s.stage = "frame_ok";
        break;
      }
      case "frame_reject":
        need(s.stage === "frame_ready" || s.stage === "frame_ok", "当前没有可退回的首帧");
        s.stage = "comp_ok";
        break;
      case "accept":
      case "accept_force": {
        need(s.stage === "video_ready" && !!s.videoJobId, "还没有待审的视频");
        need(!(s.issues ?? []).some((x) => x.status === "open"), "还有返工问题没确认：对照新旧版本逐条标“已解决”后才能采用");
        const vc = s.videoCheck?.jobId === s.videoJobId ? s.videoCheck : undefined;
        need(action === "accept_force" || !vc || vc.pass || !!vc.failed, `视频检查没过：${vc?.issues.join("；")}。确认没问题请点“我看过了，仍然采用”`);
        s.stage = "accepted";
        break;
      }
      case "rework": {
        need(s.stage === "video_ready" || s.stage === "accepted", "当前没有可返工的视频");
        const items = note.split(/[；;\n]+/).map((x) => x.trim()).filter(Boolean);
        need(items.length > 0, "返工要写清楚问题（多条用分号隔开），新版本出来后逐条对照");
        s.issues = [...(s.issues ?? []), ...items.map((text) => ({ id: randomUUID().slice(0, 8), text: text.slice(0, 200), fromJobId: s.videoJobId, status: "open" as const, scope: issueScope }))];
        if (issueScope === "video") for (const text of items) addRule(v.projectId, { layer: "process", level: "warn", text: `短视频返工问题（整条视频都要注意）：${text.slice(0, 200)}`, source: `${v.title} #${v.shots.indexOf(s) + 1}` });
        s.stage = "frame_ok";
        break;
      }
    }
    if (note.trim()) s.checkNote = note.trim().slice(0, 400);
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

const FRAME_STYLE: Record<string, string> = {
  ugc: "Vertical 9:16 smartphone photo, looks like a real parent filmed it at home: natural indoor light, slight handheld angle, everyday clutter, true-to-life skin and fabrics. Photorealistic, not staged, no cinematic grading.",
  cinematic: "Vertical 9:16 cinematic film still, shot on cinema camera, motivated lighting, shallow depth of field, fine film grain. Photorealistic.",
};

/** 自拍镜头不管视频画风（电影感也一样）：一律是手机前置摄像头拍的样子 */
const SELFIE_STYLE = "Vertical 9:16 smartphone front-camera selfie photo: slight wide-angle look, everything in focus (no shallow depth of field), natural daylight, true-to-life skin and fabrics, casual and unposed. Photorealistic, not cinematic, no film grain.";

/** 本镜场地（旧数据没有就按 video.room 迁移到场地库 v1） */
function shotScene(v: ShortVideo, s: ShortShot) {
  const scenes = ensureScenes(v.projectId, listShortVideos(v.projectId));
  const sh = s.scene ?? legacyShotScene(scenes, v.room, videoTheme(v).theme);
  const sc = getScene(sh.id);
  return sc ? { sc, ver: versionOf(sc, sh.v), sh } : null;
}

const famOf = (s: ShortShot) => s.family ?? 1;

/** 场地 / 镜头特殊要求 */
function specialText(v: ShortVideo, s: ShortShot): string {
  const sc = shotScene(v, s)?.sc;
  return [sc?.special.trim(), s.special?.trim()].filter(Boolean).map((x) => `Special requirements (must follow): ${x}`).join("\n");
}

/** 选了颜色款：产品颜色以该颜色款的实物照为准 */
function colorText(v: ShortVideo): string {
  const c = v.colorId ? getColor(v.colorId) : null;
  return c ? `Product color variant "${c.name}": the product reference photos show this exact color version; match every colored part, finish and sticker to them, not to any other color.` : "";
}

interface RefPart {
  text: string;
  file: () => Promise<string | null>;
}

const stillOf = async (v: ShortVideo, shot: ShortShot) => {
  const j = getJob(shot.videoJobId!);
  const src = j && jobFilePath(j);
  if (!src || !fs.existsSync(src)) throw new Error("参考镜头的视频文件不存在，无法做连续性参考");
  return lastFrame(src, path.join(videoDir(v.projectId, v.id), `last-${shot.videoJobId}.png`));
};

/**
 * 首帧参考图（按顺序编号）：3D 构图 → 同角度产品渲染 → 连续性参考。
 * 同场地同家庭：上一镜画面（人和房间）；回到旧场地：该场地最后一个已采用镜头（只看房间）；
 * 同一家人换场地：该家庭最后一个已采用镜头（只看人）；新场地有空场景参考图就用它；另一个家庭不带旧演员。
 */
function refPlan(v: ShortVideo, s: ShortShot): RefPart[] {
  const out: RefPart[] = [];
  // 车里自拍：只发出镜的人在别的镜头里的首帧（认脸、发型、衣服），不发 3D 和产品
  if (s.hook?.scene === "car") {
    const id = selfieId(v, s);
    // 家庭库有采用的定妆照就用它认脸（比别的镜头的首帧干净）
    const pr = id ? portraitRef(v, s, id, selfieWho(v, s)) : null;
    if (pr) return [pr];
    const ref = id ? v.shots.find((x) => x !== s && x.frameJobId && ["frame_ok", "video_ready", "accepted"].includes(x.stage) && (x.layout?.figures ?? []).some((f) => f.memberId === id)) : undefined;
    if (ref)
      out.push({
        text: `is a photo of ${selfieWho(v, s)} from another shot of this video. Use it only for identity: the same face, age, hair and clothes. Ignore its place, the product and everyone else in it.`,
        file: async () => {
          const j = getJob(ref.frameJobId!);
          const f = j && jobFilePath(j);
          return f && fs.existsSync(f) ? f : null;
        },
      });
    return out;
  }
  const dir = (l: NonNullable<ShortShot["layout"]>) => Math.atan2(l.lookAt[1] - l.camPos[1], l.lookAt[0] - l.camPos[0]);
  const turned = (x: ShortShot) => !!(s.layout && x.layout) && Math.abs(((dir(s.layout!) - dir(x.layout!) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > Math.PI / 3;
  const comp = s.compFile ? path.join(videoDir(v.projectId, v.id), s.compFile) : null;
  if (comp) {
    out.push({
      text: "is a simple 3D blocking render of this exact shot: match its camera angle, lens, framing, and the product's position, size and orientation exactly; furniture sits where the blocking puts it. Replace the untextured shapes with a real, lived-in home matching the description; the translucent mannequins or capsule mark where people are. Plain sky or empty flat ground at the edges of the render is just unfinished 3D: fill it as the location text describes.",
      file: async () => (fs.existsSync(comp) ? comp : null),
    });
    if (angleRefPath(v, s))
      out.push({
        text:
          modelFor(v.projectId, v.colorId)?.source === "fal"
            ? "is a rough automatic gray model of the product from exactly this shot's camera angle: use it ONLY for where the product stands, how big it is and which side faces the camera, never mirrored or turned. Its shape is approximate: every part, proportion, the handlebar, seat, baskets, colors, logo and stickers come only from the real product photos"
            : "is the real product rendered from exactly this shot's camera angle: in the photo the product must face exactly this way and show this same side, never mirrored or turned.",
        file: () => angleRef(v, s),
      });
  }
  const me = shotScene(v, s);
  const i = v.shots.indexOf(s);
  const done = v.shots.slice(0, Math.max(0, i)).filter((x) => x.stage === "accepted" && x.videoJobId);
  // 开头接的是正文：按正文顺序找参考（离开头最近的正文镜头优先）；正文镜头找前面最近的
  const cands = s.hook ? v.shots.filter((x) => !x.hook && x.stage === "accepted" && x.videoJobId) : [...done].reverse();
  const sceneId = (x: ShortShot) => (x.scene ?? (me ? legacyShotScene([me.sc], v.room) : null))?.id;
  const place = cands.find((x) => me && sceneId(x) === me.sc.id && (shotScene(v, x)?.sh.theme ?? "") === me.sh.theme);
  const people = cands.find((x) => famOf(x) === famOf(s));
  if (place && people && place === people) {
    out.push({
      text: `is the last frame of ${place === done[done.length - 1] ? "the previous shot" : "an earlier shot"} in this same video. Use it only for identity: same people (faces, age, hair, wardrobe), ${turned(place) ? "same decor style and lighting (this shot's camera faces a different direction: ignore that frame's background and follow Image 1 and the location text for what is behind the people)" : "same home, decor and lighting"}, same product with the same accessories. This is a different moment of the same real TikTok clip, cut together by a parent: a new angle and action as described, not a copy of that frame.`,
      file: () => stillOf(v, place),
    });
  } else {
    if (place)
      out.push({
        text: `is a frame from an earlier shot in this same location. Use it only for the place: same architecture, furniture, decor and lighting.${turned(place) ? " This shot's camera faces a different direction: ignore that frame's background and follow Image 1 and the location text for what is behind the people." : ""} ${famOf(place) !== famOf(s) ? "Ignore the people in it: this shot shows a different family with different people." : "Ignore the people's poses."}`,
        file: () => stillOf(v, place),
      });
    else if (me?.ver.refJobId)
      out.push({
        text: "is a reference photo of this location with nobody in it. Match its architecture, furniture style, colors and lighting.",
        file: async () => {
          const j = getJob(me.ver.refJobId!);
          const f = j && jobFilePath(j);
          return f && fs.existsSync(f) ? f : null;
        },
      });
    if (people)
      out.push({
        text: "is a frame from an earlier shot with the same family in a different place. Use it only for the people: same faces, age, hair and wardrobe, and the same product with the same accessories. Ignore its room and background: this shot is in a different location.",
        file: () => stillOf(v, people),
      });
  }
  return [...out, ...castPortraits(v, s)];
}

/** 家庭库采用的定妆照：认脸；这个节日自己那张连衣服一起认 */
function portraitRef(v: ShortVideo, s: ShortShot, memberId: string, who: string): RefPart | null {
  const fam = castOf(v.families, famOf(s));
  const m = fam?.members.find((x) => x.id === memberId);
  const hit = m ? portraitFor(m, videoTheme(v).theme) : null;
  if (!fam || !hit) return null;
  const f = portraitPath(fam.id, hit.p);
  if (!fs.existsSync(f)) return null;
  return {
    text: `is the approved casting photo of ${who}: the same face, age, hair, skin tone and build.${hit.outfit ? " Same clothes too." : " Ignore its clothes: dress them as described in this prompt."} Ignore its plain gray background and standing pose.`,
    file: async () => f,
  };
}

/** 3D 里绑了成员的人偶各发一张定妆照（最多 4 张，Sunburst 一共 16 张参考图） */
function castPortraits(v: ShortVideo, s: ShortShot): RefPart[] {
  if (!s.layout) return [];
  const fam = castOf(v.families, famOf(s));
  return figuresOf(s.layout)
    .flatMap((f, k) => {
      const m = fam?.members.find((x) => x.id === f.memberId);
      const r = m ? portraitRef(v, s, m.id, `Person ${k + 1} (${m.name})`) : null;
      return r ? [r] : [];
    })
    .slice(0, 4);
}

const FRAME_PROMPT_MAX = 4900;

/** 产品的车把 / 座椅接触点：模型页保存的为准；没保存时和 3D 页一样先用 KB002 的（3D 页会按模型尺寸估，服务器这边拿不到尺寸） */
/** 首帧出图后自动看图：对照提示词和 3D；没 Key 或出错只记下来，不拦生成 */
async function runFrameCheck(videoId: string, shotId: string, jobId: string, bytes: Buffer) {
  const at = new Date().toISOString();
  const v0 = getShortVideo(videoId);
  const s0 = v0?.shots.find((x) => x.id === shotId);
  if (!v0 || !s0) return;
  let res: NonNullable<ShortShot["frameCheck"]>;
  if (!getVisionKey()) res = { jobId, pass: false, failed: true, issues: ["没做：设置里还没填 Gemini Key"], at };
  else
    try {
      const th = videoTheme(v0);
      const r = await reviewShortFrame({
        image: bytes,
        productName: getProduct(v0.projectId)?.name ?? "",
        productFacts: productText(v0.projectId),
        framePrompt: s0.framePrompt,
        description: s0.description,
        facts3d: s0.layout ? [layoutText(s0.layout), blockingText(s0.layout, rigOf(v0))].join("\n") : "没有 3D 摆位",
        holiday: th.theme && th.theme !== "none" ? th.themeText || th.theme : "none",
        noBox: s0.hook ? s0.hook.entry !== "unbox" : !/\b(box|packag|unbox)/i.test(s0.framePrompt),
        car: s0.hook?.scene === "car" ? { person: carPersonText(v0, s0) } : undefined,
      });
      // 说没过却一条问题都没列：当成“没检查成”，让用户自己看，不显示“发现 0 个问题”
      res = !r.pass && !r.issues.length ? { jobId, pass: false, failed: true, issues: ["没检查成：检查结果说不过关，但没列出问题，请自己对照产品照看一遍"], at } : { jobId, pass: r.pass, issues: r.issues, at };
    } catch (e) {
      res = { jobId, pass: false, failed: true, issues: [`没做成：${e instanceof Error ? e.message : "未知错误"}`], at };
    }
  const v = getShortVideo(videoId);
  const s = v?.shots.find((x) => x.id === shotId);
  if (!v || !s || s.frameJobId !== jobId) return;
  s.frameCheck = res;
  saveShortVideo(v);
}

const execFileP = promisify(execFile);

/** 视频出来后自动看：每 0.5 秒截一帧，对照产品照查变形；没 Key 或出错只记下来，让用户自己看 */
async function runVideoCheck(videoId: string, shotId: string, jobId: string, bytes: Buffer) {
  const at = new Date().toISOString();
  const v0 = getShortVideo(videoId);
  const s0 = v0?.shots.find((x) => x.id === shotId);
  if (!v0 || !s0) return;
  let res: NonNullable<ShortShot["videoCheck"]>;
  if (!getVisionKey()) res = { jobId, pass: false, failed: true, issues: ["没做：设置里还没填 Gemini Key，请自己逐秒看一遍"], at };
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcheck-"));
    try {
      if (!ffmpegPath) throw new Error("找不到 ffmpeg");
      const src = path.join(dir, "v.mp4");
      fs.writeFileSync(src, bytes);
      await execFileP(ffmpegPath, ["-v", "error", "-i", src, "-vf", "fps=2,scale=768:-2", "-q:v", "4", path.join(dir, "f%02d.jpg")]);
      const frames = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort().slice(0, 16).map((f, i) => ({ t: i * 0.5, img: fs.readFileSync(path.join(dir, f)) }));
      if (!frames.length) throw new Error("视频截不出画面");
      const car = s0.hook?.scene === "car";
      const ref = car ? undefined : (await productRefFiles(v0.projectId, v0.colorId))[0];
      const r = await reviewShortVideo({ frames, productRef: ref ? fs.readFileSync(ref.file) : null, productName: getProduct(v0.projectId)?.name ?? "", productFacts: productText(v0.projectId), productAbsent: car });
      res = !r.pass && !r.issues.length ? { jobId, pass: false, failed: true, issues: ["没检查成：检查结果说不过关，但没列出问题，请自己逐秒看一遍"], at } : { jobId, pass: r.pass, issues: r.issues, at };
    } catch (e) {
      res = { jobId, pass: false, failed: true, issues: [`没做成：${e instanceof Error ? e.message : "未知错误"}，请自己逐秒看一遍`], at };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const v = getShortVideo(videoId);
  const s = v?.shots.find((x) => x.id === shotId);
  if (!v || !s || s.videoJobId !== jobId) return;
  s.videoCheck = res;
  saveShortVideo(v);
}


/** 自拍开头：拿手机的人自己入镜（前置摄像头，手臂伸直），其余人和产品在他身后 / 旁边 */
function selfieFrameText(filmer: string): string {
  return `Selfie shot from the phone's front camera: ${filmer || "the parent filming"} holds the phone at arm's length and is in the frame, face and upper body in the right part of the frame, exactly where the 3D blocking puts them, looking into the lens, mouth slightly open as if about to speak; the product and anyone else stay clearly visible behind or beside them. The phone itself is not visible.`;
}

/** 自拍的人：镜头指定的拿手机的人 → AI 放进画面的大人 → 家里第一个大人 */
/** 自拍的人：视频设定里「拿手机的人」，没设就用家里第一个大人（写剧本和摆 3D 用同一个） */
function selfieMember(members: FamilyMember[], filmer?: string): FamilyMember | undefined {
  // 规则：只有一个大人出镜时首选妈妈，没有妈妈才用拿手机的人 / 第一个大人
  return members.find((x) => x.role === "mom") ?? members.find((x) => x.id === filmer) ?? members.find((x) => memberKind(x) === "adult");
}

/** 自拍的人在提示词里怎么称呼：按 3D 里「自拍」人偶绑定的家庭成员，没有再用拿手机的人 */
function selfieWho(v: ShortVideo, s: ShortShot): string {
  const id = s.layout?.figures?.find((f) => f.id === "self")?.memberId ?? selfieId(v, s);
  const m = id ? castOf(v.families, s.family ?? 1)?.members.find((x) => x.id === id) : undefined;
  return m ? `${m.name} (the ${m.role === "other" ? "adult" : m.role})` : filmerText(v, s);
}

/** 出镜的人：Hook 面板里选的 → 妈妈 → 视频设定里拿手机的人 → 家里第一个大人 */
function selfieId(v: ShortVideo, s: ShortShot): string | undefined {
  const members = castOf(v.families, s.family ?? 1)?.members ?? [];
  return (members.find((x) => x.id === s.hook?.who) ?? selfieMember(members, filmerId(v, s)))?.id;
}

/** 出镜的人的家庭资料（名字、年龄、发型、衣服），出图和看图检查用同一句 */
function carPersonText(v: ShortVideo, s: ShortShot): string {
  const fam = castOf(v.families, famOf(s));
  const m = fam?.members.find((x) => x.id === selfieId(v, s));
  // 家庭的族裔写在家庭资料里，不写的话出图模型会随便挑
  return fam && m ? `${memberText(m, videoTheme(v).theme)}, from ${fam.about.en.replace(/\s+(in|with)\b.*$/, "")}` : selfieWho(v, s);
}

/** 车里自拍第一段：只有出镜的人坐在停着的车里说话，产品不入镜（不发产品图，补充文字里提到产品的句子删掉） */
function carFramePrompt(v: ShortVideo, s: ShortShot): string {
  const name = getProduct(v.projectId)?.name ?? "";
  const bad = new RegExp(`\\b(tricycles?|trikes?|bikes?|strollers?|ride-on|products?|toys?)\\b${name ? `|${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` : ""}`, "i");
  const notes = cleanShotNotes(s.framePrompt.trim().replace(/^English:\s*/i, ""), { wardrobe: true, selfie: true })
    .text.split(/(?<=[.!?;,])\s+/)
    // 脸在左边还是右边由程序定（画面中间），AI 写的左右删掉
    .filter((x) => x && !bad.test(x) && !/\b(left|right)\b/i.test(x))
    .join(" ")
    .replace(/,\s*$/, "");
  return [
    SELFIE_STYLE,
    ...refPlan(v, s).map((r, k) => `Image ${k + 1} ${r.text}`),
    `Selfie inside a parked car: ${selfieWho(v, s)} sits in the driver's seat of a parked car with the seat belt on and holds the phone at arm's length with the front camera. Face and shoulders fill the middle of the frame, looking into the lens, mouth slightly open as if about to speak. Behind them: the headrest, the side window and part of the roof, soft daylight through the windows. The phone itself is not visible.`,
    `This person is ${carPersonText(v, s)}.`,
    notes ? `Shot notes (expression, light and mood only): ${notes}` : "",
    `Nobody else in the car. No ${name || "product"}, no tricycle, bike, stroller or ride-on toy anywhere in the image: the product only appears after the cut.`,
    "No text, captions, watermarks or UI overlays in the image.",
  ]
    .filter(Boolean)
    .join("\n");
}

function selfieMe(v: ShortVideo, s: ShortShot, crew: HookPerson[]): HookPerson {
  const members = castOf(v.families, s.family ?? 1)?.members ?? [];
  const fid = filmerId(v, s);
  void crew;
  const m = members.find((x) => x.id === s.hook?.who) ?? selfieMember(members, fid);
  return {
    kind: m ? memberKind(m) : "adult",
    pose: "stand",
    ...(m ? { memberId: m.id, h: m.heightCm / 100 } : {}),
    action: "伸手举着手机自拍，看着镜头做反应",
    actionEn: "holding the phone out at arm's length for a selfie, looking into the lens and reacting",
  };
}

function framePromptOf(v: ShortVideo, s: ShortShot): string {
  if (s.hook?.scene === "car") return carFramePrompt(v, s);
  const p = getProduct(v.projectId);
  const look = findTemplate(v.templateId).look;
  const me = shotScene(v, s);
  const plan = refPlan(v, s);
  const i = v.shots.indexOf(s);
  const prior = s.hook ? v.shots.filter((x) => !x.hook) : v.shots.slice(0, Math.max(0, i));
  const otherFamily = prior.some((x) => famOf(x) !== famOf(s)) && !prior.some((x) => famOf(x) === famOf(s));
  const NOTES = "@@NOTES@@";
  const parts = [
    s.hook?.selfie ? SELFIE_STYLE : me?.sc.outdoor ? (FRAME_STYLE[look] ?? FRAME_STYLE.ugc).replace("filmed it at home: natural indoor light", "filmed it outside the house: natural outdoor daylight") : (FRAME_STYLE[look] ?? FRAME_STYLE.ugc),
    ...plan.map((r, k) => `Image ${k + 1} ${r.text}`),
    s.layout ? layoutText(s.layout) : "",
    s.layout ? `3D BLOCKING (authoritative: the positions, poses and orientation below override any conflicting wording later in this prompt): ${blockingText(s.layout, rigOf(v))}` : "",
    castText(v, s),
    me ? sceneText(me.sc, me.ver, me.sh, s.layout ? itemSight(s.layout) : undefined) : "",
    me ? sceneVariation(v, s, me.sc.outdoor) : "",
    otherFamily ? "This shot shows a different family from the earlier shots: different people and a different home; only the product is the same model." : "",
    specialText(v, s),
    NOTES,
    s.hook?.selfie ? selfieFrameText(selfieWho(v, s)) : operatorPrompt(s.operator, s.layout, filmerText(v, s)),
    s.productNote.trim()
      ? `Product: ${p?.name || "the product"} — use the product reference photos: keep exact geometry, proportions, colors, materials and logo placement; do not redesign, recolor or add parts. Matte, even light on the product: no glare, sparkle or bright highlight spots.`
      : "",
    colorText(v),
    s.compositeNote.trim() ? "Any screen, projection or printed graphic on the product is left plain/blank; it will be composited later." : "",
    findTemplate(v.templateId).needsPackaging
      ? "Any packaging must match the packaging reference photos exactly; do not invent box designs or print."
      : "The product appears fully assembled and out of any box. No cardboard boxes, shipping boxes, product packaging or unwrapping anywhere in the image.",
    "No text, captions, watermarks or UI overlays in the image.",
  ].filter(Boolean);
  // Sunburst 的 prompt 上限 5000 字符：超了先缩短「画面细节」，其余规则一个字不删
  const lead = "Shot notes (wardrobe, expression, light and mood only; positions, actions and background come from above): ";
  // 衣服以家庭库为准、自拍画风以手机前置为准：补充文字里打架的句子直接删掉
  const notes = cleanShotNotes(s.framePrompt.trim().replace(/^English:\s*/i, ""), {
    wardrobe: (s.layout?.figures ?? []).some((f) => f.memberId),
    selfie: Boolean(s.hook?.selfie),
  }).text;
  const rest = parts.filter((x) => x !== NOTES).join("\n").length + 1;
  const room = FRAME_PROMPT_MAX - rest - lead.length;
  const fit = notes.length <= room ? notes : room > 80 ? `${notes.slice(0, room - 1).replace(/\s+\S*$/, "")}…` : "";
  return parts.map((x) => (x === NOTES ? (fit ? lead + fit : "") : x)).filter(Boolean).join("\n");
}

/** 拿手机的家庭成员：“Ryan, a 34-year-old man, …”（衣服跟视频节日）；没指定 = 空 */
function filmerText(v: ShortVideo, s: ShortShot): string {
  const id = filmerId(v, s);
  const fam = id ? castOf(v.families, famOf(s)) : null;
  const m = fam?.members.find((x) => x.id === id);
  return fam && m ? memberText(m, videoTheme(v).theme) : "";
}

/** 绑定了家庭成员的人偶：“Person 1 is Leo, a 3-year-old boy, …”（衣服跟视频节日） */
function castText(v: ShortVideo, s: ShortShot): string {
  const fam = castOf(v.families, famOf(s));
  if (!fam || !s.layout) return "";
  const th = videoTheme(v).theme;
  const who = figuresOf(s.layout).flatMap((f, k) => {
    const m = fam.members.find((x) => x.id === f.memberId);
    return m ? [`Person ${k + 1} is ${memberText(m, th)}.`] : [];
  });
  // 家庭的族裔写在家庭资料里：不写的话出图模型会随便挑（车里自拍之外的镜头也一样）
  const from = fam.about.en.replace(/\s+(in|with)\b.*$/, "").trim();
  return who.length ? `People (the same real people in every shot of this family; match their age, height, hair and clothes${from ? `; they are ${from}` : ""}): ${who.join(" ")}` : "";
}

/** 空场景参考图：只有房间和主题布置，没有人、没有产品 */
function scenePromptOf(me: NonNullable<ReturnType<typeof shotScene>>): string {
  return [
    me.sc.outdoor
      ? "Vertical 9:16 ordinary smartphone photo of this empty outdoor place, taken at adult eye level, natural everyday daylight, real lived-in neighborhood, not a showroom or 3D render."
      : "Vertical 9:16 ordinary smartphone photo of an empty room, taken at adult eye level from the open side of the room, everyday indoor light, lived-in but tidy, real home, not a showroom or 3D render.",
    sceneText(me.sc, me.ver, me.sh),
    me.sc.special.trim() ? `Special requirements (must follow): ${me.sc.special.trim()}` : "",
    "Nobody in the photo: no people, no hands, no pets. No bicycles, balance bikes or ride-on toys. No cardboard boxes, shipping boxes or packaging. No text, logos or watermarks.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 声音：关 = 不写；开 = 只要环境音和动作声效；自拍 = 拿手机的人说一句台词 */
function soundPrompt(v: Pick<ShortVideo, "sound">, s: Pick<ShortShot, "hook" | "caption">, filmer: string): string {
  if (s.hook?.selfie) {
    const line = (s.hook.line ?? "").trim().replace(/"/g, "'");
    return `Selfie video: ${filmer || "the person filming"} holds the phone at arm's length with the front camera, looks into the lens and says: "${line}". Any hand over the mouth comes down before speaking. Audio: only that spoken line plus ambient sound and the sounds of the actions on screen; no music, nobody else speaks.`;
  }
  return shotSound(v, s) ? "Audio: only ambient sound and the sound effects of the actions on screen; nobody speaks, no music." : "";
}

function videoPromptOf(v: ShortVideo, s: ShortShot): string {
  if (s.hook?.scene === "car")
    return `${dropCameraMoves(s.motionPrompt)}\nCamera: the phone is held at arm's length by the person in the driver's seat; natural slight hand shake and small drifts, not stabilized.\nThe product does not appear in this clip: no tricycle, bike, stroller or ride-on toy. Same person, wardrobe, car interior and light as the first frame throughout; nobody else appears. Looks like real phone footage for TikTok: natural speed, casual and unposed. No text overlays.\n${soundPrompt(v, s, selfieWho(v, s))}`;
  // 画面里没人：产品不能自己动（没人推它）
  // 拍摄者露出（手、影子）不算有人推车：画面里没人，车就不能自己动
  const still = !shotHasPeople(s);
  const op = s.hook?.selfie ? "" : operatorPrompt(s.operator, s.layout, filmerText(v, s));
  const au = soundPrompt(v, s, s.hook?.selfie ? selfieWho(v, s) : filmerText(v, s));
  const sp = specialText(v, s);
  const riding = (s.layout ? figuresOf(s.layout) : []).some((f) => f.onProduct);
  // 骑向镜头时车越来越大、角度一直变，模型最容易画错结构：改成横着骑过画面
  const motion0 = dropGlare(s.motionPrompt);
  const motion = riding ? dropCameraMoves(motion0).replace(/\b(?:straight |directly )?(?:toward|towards|at|into) (?:the )?(?:camera|lens|viewer)\b/gi, "slowly across the frame") : dropCameraMoves(motion0);
  const moving = !!s.layout?.move && s.layout.move.kind !== "static";
  const stay = still
    ? `The product stands still on the ground for the whole clip: it never rolls, turns, slides or moves by itself, and its wheels do not spin.${moving ? " Only the camera moves." : " Nothing moves except natural ambient motion in the background."}\n`
    : `The product keeps exactly the structure, parts, colors and proportions of the first frame in every frame: no part disappears, merges, bends or changes size.${(s.layout ? figuresOf(s.layout) : []).some((f) => f.onProduct) ? " The rider pedals slowly and stays at about the same distance from the camera; the product keeps the same size in frame and never rides toward or past the camera." : ""}\n`;
  return `${motion ? `${motion}\n` : ""}${sp ? `${sp}\n` : ""}${s.hook?.selfie && s.layout?.move?.kind === "handheld" ? "Camera: the phone is held at arm's length by the person taking the selfie; natural slight hand shake and small drifts, not stabilized." : moveText(s.layout)}\n${op ? `${op}${operatorShows(s.operator, s.layout) ? " Keep what shows of them partly visible and moving naturally through the clip." : ""}\n` : ""}${stay}Keep the product's shape, colors and logo exactly as in the first frame. ${still ? "Same place and lighting as the first frame throughout; no people appear." : "Same people, wardrobe, room and lighting as the first frame throughout; no new people appear."} Looks like real phone footage a parent shot for TikTok: natural speed, no slow motion, no smooth cinematic camera glide, casual unposed behavior. No text overlays.${au ? `\n${au}` : ""}`;
}

interface Prepared {
  v: ShortVideo;
  s: ShortShot;
  kind: JobKind;
  seconds: number;
  prompt: string;
  hash: string;
  unit: number;
  quote: Quote;
}

async function prepare(videoId: string, shotId: string, kind: JobKind, seconds: number, reason: string, overLimit: boolean): Promise<Prepared> {
  const v = load(videoId);
  const s = v.shots.find((x) => x.id === shotId);
  if (!s) throw new Error("镜头不存在");
  if (kind === "video" && s.hook?.selfie && !s.hook.line?.trim()) throw new Error("自拍台词必填：在「生成视频」旁边填");
  const jobs = listJobs(videoId).map(toJobView);
  const secs = kind === "video" ? Math.round(seconds) : 0;
  const me = kind === "scene" ? shotScene(v, s) : null;
  if (kind === "scene" && !me) throw new Error("本镜还没有场地");
  const prompt = kind === "video" ? videoPromptOf(v, s) : kind === "scene" ? scenePromptOf(me!) : framePromptOf(v, s);
  if (kind !== "video" && prompt.length > 5000) throw new Error(`提示词 ${prompt.length} 字符，超过 Sunburst 的 5000 上限：先删减场地或镜头的特殊要求`);
  const hash = paramsKey(kind, { prompt, seconds: secs, resolution: kind === "video" ? v.resolution : "", frameJobId: kind === "video" ? s.frameJobId : kind === "scene" ? `${me!.sc.id}:v${me!.ver.v}` : s.compFile });
  let unit: number = kind === "video" ? videoUsdPerSec(s, v.resolution) : FRAME_USD_FALLBACK;
  // 估价接口免费；能拿到金额就以它为准
  try {
    const est =
      kind === "video"
        ? { usd: NaN }
        : await estimate(FRAME_MODEL, { prompt: "estimate", quality: "high", resolution: "2k", aspect_ratio: "9:16" });
    if (Number.isFinite(est.usd) && est.usd > 0) unit = kind === "video" ? est.usd / (secs || VIDEO_MIN_SEC) : est.usd;
  } catch {
    /* 估价失败时用实测单价 */
  }
  const quote = quoteJob({ kind, shot: s, video: v, jobs, paramsHash: hash, unitUsd: Math.round(unit * 10000) / 10000, seconds: secs, reason, overLimit });
  if (kind !== "scene") {
    const own = promptConflicts(s, rigOf(v));
    const extra = kind === "frame" ? [...new Set([...shotChecks(s, basisOf(s, placeOf(v, s))), ...castConflicts(v, s)])].filter((m) => !own.some((c) => c.msg === m)) : [];
    quote.conflicts = [...own, ...extra.map((msg) => ({ msg, fix: "text" as const }))];
  }
  return { v, s, kind, seconds: secs, prompt, hash, unit, quote };
}

export async function quoteJobAction(videoId: string, shotId: string, kind: JobKind, seconds: number, reason: string, overLimit: boolean): Promise<Result<Quote>> {
  try {
    return { result: (await prepare(videoId, shotId, kind, seconds, reason, overLimit)).quote };
  } catch (e) {
    return fail(e);
  }
}

/** 原模型的渲染图在 short-refs/，颜色款的在 short-refs/<colorId>/ */
const refDir = (projectId: string, colorId?: string | null) => path.join(cadDir(projectId), "short-refs", ...(colorId ? [colorId] : []));

/** 产品参考图：选了颜色款用该颜色的实物照，否则用产品照；都没有就用 3D 模型渲染的参考图。车身贴纸跟在 Logo 后面 */
export async function productRefFiles(projectId: string, colorId?: string | null): Promise<{ file: string; mime: string }[]> {
  const assets = listAssets(projectId).filter((a) => a.mime !== "image/svg+xml" && fs.existsSync(assetPath(a)));
  const ref = (a: (typeof assets)[number]) => ({ file: assetPath(a), mime: a.mime });
  const color = colorId ? assets.filter((a) => a.kind === "color_photo" && a.colorId === colorId) : [];
  const photos = (color.length ? color : productPhotos(assets)).slice(0, 5).map(ref);
  const renders = PRODUCT_REF_VIEWS.map((r) => path.join(refDir(projectId, colorId), `${r.name}.png`)).filter((f) => fs.existsSync(f)).map((file) => ({ file, mime: "image/png" }));
  const logo = assets.filter((a) => a.kind === "logo").slice(0, 1).map(ref);
  const stickers = assets.filter((a) => a.kind === "sticker").slice(0, 3).map(ref);
  const product = photos.length ? photos : renders;
  return product.length ? [...product, ...logo, ...stickers] : [];
}

/** 用 3D 模型按本镜机位角度渲染的产品参考图（免费），锁住产品朝向 */
function angleRefPath(v: ShortVideo, s: ShortShot): string | null {
  if (!s.compFile || !s.layout?.bike) return null;
  const m = modelFor(v.projectId, v.colorId);
  if (!m || !fs.existsSync(modelPath(m))) return null;
  return path.join(videoDir(v.projectId, v.id), `angle-${m.colorId ? `${m.id.slice(0, 8)}-` : ""}${s.compFile.replace(/\.png$/, "")}.png`);
}

/** 保存 3D 构图时浏览器顺带截下来（不再用 Blender）；没有就要重新保存构图 */
async function angleRef(v: ShortVideo, s: ShortShot): Promise<string | null> {
  const out = angleRefPath(v, s);
  return out && fs.existsSync(out) ? out : null;
}

/** 保存同角度产品参考图（浏览器 3D 截图，PNG data URL），跟着当前 3D 构图走 */
export async function saveShortAngleAction(videoId: string, shotId: string, dataUrl: string): Promise<{ error?: string }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    const out = angleRefPath(v, s);
    if (!out) throw new Error("先保存带产品的 3D 构图");
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const bytes = m ? Buffer.from(m[1], "base64") : null;
    if (!bytes || bytes.length < 1000 || bytes.length > 8 * 1024 * 1024) throw new Error("产品参考图无效");
    putFile(keyFromPath(out), bytes);
    return {};
  } catch (e) {
    return fail(e);
  }
}

async function frameRefs(v: ShortVideo, s: ShortShot): Promise<string[]> {
  const car = s.hook?.scene === "car";
  const files = car ? [] : await productRefFiles(v.projectId, v.colorId);
  if (!car && !files.length) throw new Error("没有产品参考图：先上传产品照，或在短视频列表页用 3D 模型渲染参考图（免费）");
  const urls: string[] = [];
  for (const r of refPlan(v, s)) {
    const f = await r.file();
    if (!f) throw new Error("参考图文件不存在：先点「退回构图」，再打开 3D 点「保存」");
    urls.push(await uploadFile(readFile(keyFromPath(f)), "image/png"));
  }
  if (!car && findTemplate(v.templateId).needsPackaging) {
    const pk = listAssets(v.projectId).filter((a) => a.kind === "packaging_photo" && fs.existsSync(assetPath(a))).slice(0, 3);
    if (!pk.length) throw new Error("开箱视频要先在产品页上传真实包装照片");
    for (const a of pk) urls.push(await uploadFile(readFile(keyFromPath(assetPath(a))), a.mime));
  }
  for (const f of files.slice(0, Math.max(1, 16 - urls.length))) urls.push(await uploadFile(readFile(keyFromPath(f.file)), f.mime));
  return urls;
}

/** 免费：保存浏览器用 3D 模型渲染的一张产品参考图（PNG data URL） */
export async function saveProductRefAction(projectId: string, name: string, dataUrl: string): Promise<{ error?: string }> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    if (!PRODUCT_REF_VIEWS.some((r) => r.name === name)) throw new Error("参考图名称不对");
    const m = modelFor(projectId, null);
    if (!m || !fs.existsSync(modelPath(m))) throw new Error("请先在产品页上传 GLB 模型");
    const x = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const bytes = x ? Buffer.from(x[1], "base64") : null;
    if (!bytes || bytes.length < 1000 || bytes.length > 8 * 1024 * 1024) throw new Error("参考图无效");
    putFile(keyFromPath(path.join(refDir(projectId, m.colorId), `${name}.png`)), bytes);
    revalidatePath(`/projects/${projectId}/shorts`);
    return {};
  } catch (e) {
    return fail(e);
  }
}

/** 人偶「动作」栏：中文原话译成英文（DeepSeek，不到 $0.01）；没改过的沿用上次的译文 */
async function translateActions(l: SetLayout, prev: SetLayout | null) {
  const old = new Map(prev ? figuresOf(prev).map((f) => [f.id, f] as const) : []);
  const todo = (l.figures ?? []).filter((f) => {
    const o = old.get(f.id);
    if (f.action && o?.action === f.action && o.actionEn) f.actionEn = o.actionEn;
    else delete f.actionEn;
    return !!f.action && !f.actionEn;
  });
  if (!todo.length) return;
  const { data } = await chatJson({
    system: "Translate each Chinese line, describing what one person is doing in a photo, into one short literal English phrase for an image model, starting with a present participle (e.g. 'gripping the handlebars with both hands to hold the bike steady'). Add nothing that is not in the Chinese. Output json: {\"items\":[\"...\"]} in the same order.",
    user: JSON.stringify(todo.map((f) => f.action)),
    maxTokens: 800,
  });
  const items = (data as { items?: unknown } | null)?.items;
  todo.forEach((f, k) => {
    const t = Array.isArray(items) ? items[k] : null;
    if (typeof t !== "string" || !t.trim()) throw new Error("人偶「动作」栏翻译失败，请再点一次保存");
    f.actionEn = t.trim().slice(0, 400);
  });
}

/** 人偶动作栏写了 3D 做不到的，程序换成做得到的（免费，不调 AI；动作不进 3D 构图图，构图不作废） */
export async function fitShotActionsAction(videoId: string, shotId: string): Promise<Result<StudioState>> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    if (!fitFigureActions(s.layout, rigOf(v)).length) throw new Error("没有要改的动作");
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

function draftShot(videoId: string, shotId: string) {
  const v = load(videoId);
  const s = v.shots.find((x) => x.id === shotId);
  if (!s) throw new Error("镜头不存在");
  if (s.stage !== "draft") throw new Error("构图已确认：要改机位先在工作台点“退回构图”");
  return { v, s };
}

/** 保存机位 / 运镜；机位变了，之前截的 3D 构图作废 */
export async function saveShortLayoutAction(videoId: string, shotId: string, layout: SetLayout | null): Promise<{ error?: string }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    const l = layout ? cleanLayout(layout) : null;
    if (layout && !l) throw new Error("布景数据不完整");
    if (l) await translateActions(l, s.layout);
    s.layout = l;
    s.compFile = null;
    saveShortVideo(v);
    refresh(v);
    return {};
  } catch (e) {
    return fail(e);
  }
}

/** 按 3D 改写这一镜的文字（DeepSeek 文字调用，每次不到 $0.01）；只返回草稿，用户确认后才保存 */
/** 只读：按已保存的内容，拼出生成时会发给模型的完整提示词（免费） */
export async function promptPreviewAction(
  videoId: string,
  shotId: string,
): Promise<Result<{ frame: string; video: string }>> {
  try {
    const v = getShortVideo(videoId);
    const s = v?.shots.find((x) => x.id === shotId);
    if (!v || !s) return { error: "镜头不存在" };
    return { result: { frame: framePromptOf(v, s), video: videoPromptOf(v, s) } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rewriteShotAction(
  videoId: string,
  shotId: string,
  opts: { feedback?: string; draft?: Partial<Record<TextField, string>> } = {},
): Promise<Result<{ fields: Record<TextField, string>; notes: string[]; left: string[]; needs3d: string[] }>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    if (s.stage !== "draft") throw new Error("构图已确认：要改文字先点“退回构图”");
    if (!s.layout) throw new Error("先在场地地图摆好机位");
    const me = shotScene(v, s);
    const place = me ? { name: me.sc.name, outdoor: me.sc.outdoor, sh: me.sh } : null;
    const sync = shotSync(s, place);
    const rig = rigOf(v);
    const own = promptConflicts(s, rig).map((c) => c.msg).filter((m) => !sync.issues.includes(m));
    const figs = figuresOf(s.layout).map((f) => `${f.kind}${f.onProduct ? " (riding / sitting on the product)" : ""}, ${f.action ? `action written by the user (authoritative, except where it contradicts the hand / foot contacts below: the contacts win): ${f.action}` : `no action written yet; pose preset ${f.pose}${f.custom ? ", hands and feet adjusted by hand in 3D" : ""}`}`);
    const facts = [
      me ? sceneText(me.sc, me.ver, me.sh, itemSight(s.layout)) : "",
      me ? (me.sc.outdoor ? "This location is outdoors." : "This location is indoors.") : "",
      `People in the 3D blocking (exactly these, nobody else in frame): ${figs.length ? figs.join("; ") : "none"}.`,
      layoutText(s.layout),
      blockingText(s.layout, rig),
      (s.hook?.selfie ? selfieFrameText(selfieWho(v, s)) : operatorPrompt(s.operator, s.layout, filmerText(v, s))) || "The person filming is not visible.",
    ]
      .filter(Boolean)
      .join("\n");
    const old = Object.fromEntries(TEXT_FIELDS.map((k) => [k, s[k]])) as Record<TextField, string>;
    const feedback = String(opts.feedback ?? "").trim().slice(0, 1000);
    const draft = Object.fromEntries(TEXT_FIELDS.map((k) => [k, typeof opts.draft?.[k] === "string" ? String(opts.draft[k]).slice(0, 2000) : old[k]])) as Record<TextField, string>;
    const userRule = feedback
      ? " The user also wrote feedback in plain Chinese (userFeedback); start from currentDraft and apply it. For details the 3D cannot show (hand gestures such as pointing instead of reaching, what a hand grips or holds, facial expression, gaze, wardrobe, mood, light, small props, the motion), follow the user. For things the 3D fixes (who is in frame and how many, where each person and the product are, product orientation and pose, location, camera position and lens), do NOT apply them: every field must still state the 3D facts exactly (e.g. if the 3D puts the adult to the right of the product, the text says right even when the user asked for left), and add one short Simplified Chinese line to needs3d per such request, saying what to change in the 3D. Also add one notes line per request you actually applied; requests you could not apply go only to needs3d."
      : "";
    const { data } = await chatJson({
      system: "You keep one shot of a TikTok-style product video in sync with its 3D blocking. The 3D facts are the truth: location, people, camera lens and height, product orientation and the person filming. Check EVERY sentence of every field against the 3D facts: who is in frame, where each person and the product sit in the frame (left / center / right, near / far), poses and actions, product orientation and pose, location, background and holiday decorations, camera. The listed changes and conflicts come from a simple keyword check and are often incomplete, so also fix sentences that were not listed. A 3D pose name only describes the body position: never invent props or intentions from it (a reaching hand is not handing something over). Mention background or holiday decorations only if the location facts list them. Rewrite whatever does not match; keep all continuity details (same people, wardrobe, props, product details), the casual phone-footage style and roughly the same length. Never add a person who is not in the 3D people list; if the text mentions someone who is not there, remove them and make clear the remaining people are the only ones in frame. The person filming holds the phone and is never the subject: never call it a selfie (no 'selfie', no 自拍). Never mention the 3D blocking itself (no mannequins, gray boxes or markers). Keep the camera field consistent with the lens and camera height. Where people are and what they do come only from the 3D facts (positions plus each person's written action); the image prompt adds those automatically. So framePrompt holds only what the 3D cannot carry: wardrobe, facial expression and gaze, light, mood and small details of the people and the product; it must not describe positions, left / right, distances, poses, hand or body actions, camera or background layout. description and motionPrompt may describe actions, but only as the 3D facts give them. If a person has no written action, describe them only by the pose preset and add a needs3d line asking the user to write that person's action in the 3D figure's 动作 field (e.g. '人偶1·小孩：在 3D 的「动作」栏写这个人在做什么'). Fields description, camera and productNote are in Simplified Chinese; framePrompt and motionPrompt are in English. Output json: {\"description\":\"\",\"camera\":\"\",\"productNote\":\"\",\"framePrompt\":\"\",\"motionPrompt\":\"\",\"notes\":[\"one short Simplified Chinese line per change\"],\"needs3d\":[]}" + userRule + (feedback ? " This overrides the rule above for body and hand actions: what a person does with their body or hands (pointing, gripping the handlebars, waving, holding something) belongs only in that person's 3D 动作 field. If the feedback asks for an action that differs from that person's written action in the 3D facts, do not write it into any field; add a needs3d line such as '人偶2·大人 的「动作」栏改成：……'." : ""),
      user: JSON.stringify(feedback ? { facts3d: facts, changedSinceWritten: sync.changes, conflicts: [...sync.issues, ...own], shot: old, currentDraft: draft, userFeedback: feedback } : { facts3d: facts, changedSinceWritten: sync.changes, conflicts: [...sync.issues, ...own], shot: old }),
      maxTokens: 3000,
      thinking: !!feedback,
      timeoutMs: 180_000,
    });
    const d = (data ?? {}) as Record<string, unknown>;
    const lim: Record<TextField, number> = { description: 600, camera: 200, productNote: 300, framePrompt: 2000, motionPrompt: 1000 };
    const fields = Object.fromEntries(
      TEXT_FIELDS.map((k) => {
        const x = d[k];
        return [k, typeof x === "string" && x.trim() ? x.trim().slice(0, lim[k]) : draft[k]];
      }),
    ) as Record<TextField, string>;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string" && !!y.trim()).slice(0, 8) : []);
    const next = { ...s, ...fields };
    return { result: { fields, notes: list(d.notes), left: [...new Set([...shotChecks(next, basisOf(next, place)), ...promptConflicts(next, rig).filter((c) => c.fix === "text").map((c) => c.msg)])], needs3d: [...new Set([...list(d.needs3d), ...promptConflicts(next, rig).filter((c) => c.fix === "3d").map((c) => c.msg)])] } };
  } catch (e) {
    return fail(e);
  }
}

/** 一镜的文字同步状态（场地地图页用，免费） */
export async function shotSyncAction(videoId: string, shotId: string): Promise<Result<{ sync: ShotSync; draft: boolean; texts: Record<TextField, string> }>> {
  try {
    const v = load(videoId);
    const s = v.shots.find((x) => x.id === shotId);
    if (!s) throw new Error("镜头不存在");
    return { result: { sync: fullSync(v, s), draft: s.stage === "draft", texts: Object.fromEntries(TEXT_FIELDS.map((k) => [k, s[k]])) as Record<TextField, string> } };
  } catch (e) {
    return fail(e);
  }
}

/** 采用改写后的文字（只改这几个文字字段，并重新记下对应的 3D） */
export async function applyShotTextAction(videoId: string, shotId: string, fields: Partial<Record<TextField, string>>): Promise<{ error?: string }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    const lim: Record<TextField, number> = { description: 600, camera: 200, productNote: 300, framePrompt: 2000, motionPrompt: 1000 };
    for (const k of TEXT_FIELDS) {
      const x = fields[k];
      if (typeof x === "string" && x.trim()) s[k] = x.trim().slice(0, lim[k]);
    }
    s.textBasis = basisOf(s, placeOf(v, s));
    saveShortVideo(v);
    refresh(v);
    return {};
  } catch (e) {
    return fail(e);
  }
}

/** 拍摄者入镜（只影响提示词，不动 3D 构图） */
export async function setShotOperatorAction(videoId: string, shotId: string, operator: string): Promise<{ error?: string; recapture?: boolean }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    const before = parseOp(s.operator);
    s.operator = operator.trim().slice(0, 300);
    // 拍摄者人偶和空着的手画在 3D 构图里：变了构图要重新保存
    const recapture = Boolean(s.compFile) && opCompKey(before) !== opCompKey(parseOp(s.operator));
    if (recapture) s.compFile = null;
    saveShortVideo(v);
    refresh(v);
    return { recapture };
  } catch (e) {
    return fail(e);
  }
}

/** 保存 3D 构图（摄影机画面截图，PNG data URL） */
export async function saveShortCompAction(videoId: string, shotId: string, dataUrl: string): Promise<{ error?: string }> {
  try {
    const { v, s } = draftShot(videoId, shotId);
    if (!s.layout) throw new Error("先保存机位");
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const bytes = m ? Buffer.from(m[1], "base64") : null;
    if (!bytes || bytes.length < 1000 || bytes.length > 12 * 1024 * 1024) throw new Error("构图图片无效");
    const name = `comp-${s.id}-${Date.now()}.png`;
    putFile(storageKey(v.projectId, "shorts", v.id, name), bytes);
    s.compFile = name;
    saveShortVideo(v);
    refresh(v);
    return {};
  } catch (e) {
    return fail(e);
  }
}

/** 用户在审批框点了“批准并生成”：再查一遍所有关口，金额必须与审批时一致 */
/** 后台跑：渲染 / 上传参考图 → 提交 → 等结果；页面不用一直等，进度从 state().running 轮询 */
async function runInBackground(key: string, videoId: string, shotId: string, kind: JobKind, p: Prepared, reason: string) {
  try {
      const input: Record<string, unknown> =
        kind === "video"
          ? await (async () => {
              const f = getJob(p.s.frameJobId!);
              const fp = f && jobFilePath(f);
              if (!f || !fp || !fs.existsSync(fp)) throw new Error("首帧文件不存在");
              const audio = shotSound(p.v, p.s);
              if (shotHasPeople(p.s)) return { prompt: p.prompt, image_url: await uploadFile(fs.readFileSync(fp), f.outputMime ?? "image/png"), duration: p.seconds, resolution: p.v.resolution, generate_audio: audio };
              const a: ArkVideoInput = { prompt: p.prompt, first_frame_file: fp, first_frame_mime: f.outputMime ?? "image/png", duration: p.seconds, resolution: p.v.resolution, generate_audio: audio };
              return { ...a };
            })()
          : kind === "scene"
            ? { prompt: p.prompt, quality: "high", resolution: "2k", aspect_ratio: "9:16", enhance_prompt: false }
            : await (async () => {
                const refs = await frameRefs(p.v, p.s);
                return { prompt: p.prompt, ...(refs.length ? { image_urls: refs } : {}), quality: "high", resolution: "2k", aspect_ratio: "9:16", enhance_prompt: false };
              })();
      const job = insertJob({
        projectId: p.v.projectId,
        videoId,
        shotId,
        kind,
        model: kind === "video" ? videoModelOf(p.s) : FRAME_MODEL,
        input,
        paramsHash: p.hash,
        seconds: p.seconds,
        estUsd: p.quote.costUsd,
        reason: reason.trim().slice(0, 400),
      });
    runs.set(key, { ...runs.get(key)!, step: "gen", jobId: job.id });
    await drive(job);
    runs.delete(key);
  } catch (e) {
    console.error("[runJob]", kind, shotId, e instanceof Error ? e.message : e);
    const r = runs.get(key);
    runs.set(key, { kind, startedAt: r?.startedAt ?? Date.now(), step: r?.step ?? "prep", jobId: r?.jobId, error: e instanceof Error ? e.message : String(e) });
  } finally {
    try {
      refresh(p.v);
    } catch {
      /* 后台没有请求上下文时 revalidate 可能报错，页面靠轮询更新 */
    }
  }
}

export async function runJobAction(
  videoId: string,
  shotId: string,
  kind: JobKind,
  seconds: number,
  reason: string,
  overLimit: boolean,
  approvedUsd: number,
): Promise<Result<StudioState>> {
  try {
    const p = await prepare(videoId, shotId, kind, seconds, reason, overLimit);
    if (p.quote.blocked.length) throw new Error(p.quote.blocked[0]);
    if (Math.abs(p.quote.costUsd - approvedUsd) > 0.005) throw new Error(`价格变了（$${approvedUsd.toFixed(2)} → $${p.quote.costUsd.toFixed(2)}），请重新审批`);
    const key = runKey(videoId, shotId);
    const cur = runs.get(key);
    if (cur && !cur.error) throw new Error("这一镜正在生成，等它完成");
    runs.set(key, { kind, startedAt: Date.now(), step: "prep" });
    void runInBackground(key, videoId, shotId, kind, p, reason);
    return { result: state(videoId) };
  } catch (e) {
    console.error("[runJob]", kind, shotId, e instanceof Error ? e.message : e);
    return { ...fail(e), result: getShortVideo(videoId) ? state(videoId) : undefined };
  }
}

/** 生成中轮询用（免费，只读） */
export async function studioStateAction(videoId: string): Promise<StudioState | null> {
  return getShortVideo(videoId) ? state(videoId) : null;
}

/** 用户看过失败原因后清掉 */
export async function clearRunErrorAction(videoId: string, shotId: string): Promise<StudioState | null> {
  const k = runKey(videoId, shotId);
  if (runs.get(k)?.error) runs.delete(k);
  return getShortVideo(videoId) ? state(videoId) : null;
}

/** 查不清 / 等不到的任务由用户了结：charged = 按估价记账（放弃等待）；否则记成失败不收费（用户在控制台确认过没扣费） */
export async function settleJobAction(jobId: string, charged: boolean): Promise<Result<StudioState>> {
  const j = getJob(jobId);
  if (!j) return { error: "任务不存在" };
  if (!["unknown", "submitting", "submitted"].includes(j.status)) return { error: "这个任务已经有结果了" };
  if (!charged && j.status !== "unknown") return { error: "已经提交成功的任务会扣费，只能放弃并按已扣费记账" };
  runs.delete(runKey(j.videoId, j.shotId));
  updateJob(j.id, charged ? { status: "abandoned", error: `已放弃等待，按已扣费 $${j.estUsd.toFixed(2)} 记账` } : { status: "failed", error: "你在控制台确认过没扣费，记成不收费" });
  return { result: state(j.videoId) };
}

/** 断线 / 超时后只能续等：submitting 用原幂等键重提（供应商不会重复扣费），submitted 只查状态 */
export async function resumeJobAction(jobId: string): Promise<Result<StudioState>> {
  const j = getJob(jobId);
  if (!j) return { error: "任务不存在" };
  const key = runKey(j.videoId, j.shotId);
  const cur = runs.get(key);
  if (cur && !cur.error) return { result: state(j.videoId) };
  if (j.status === "unknown" && !j.requestId && isArkModel(j.model)) {
    const found = await arkFindTask(Math.floor(Date.parse(j.createdAt) / 1000) - 5);
    if (found === "none") {
      updateJob(j.id, { status: "failed", error: "查清了：方舟没收到这次提交，不收费，可以重做" });
      return { result: state(j.videoId) };
    }
    if (!found) return { error: "还是查不清：到方舟控制台的任务列表，看这次提交的时间有没有新任务。有就点「放弃，按已扣费记账」，没有就点「确认没扣费」" };
    updateJob(j.id, { status: "submitted", requestId: found });
    j.status = "submitted";
    j.requestId = found;
  }
  if (j.status === "submitting" || j.status === "submitted") {
    // 后台接着等，马上返回：页面靠轮询更新，不会卡住其他按钮
    runs.set(key, { kind: j.kind, startedAt: Date.now(), step: "gen", jobId });
    void drive(j)
      .then(() => void runs.delete(key))
      .catch((e) => void runs.set(key, { kind: j.kind, startedAt: Date.now(), step: "gen", jobId, error: e instanceof Error ? e.message : String(e) }));
  } else if (cur?.error) runs.delete(key);
  return { result: state(j.videoId) };
}

async function drive(job: JobRecord): Promise<void> {
  let requestId = job.requestId;
  if (!requestId) {
    let req;
    try {
      req = isArkModel(job.model) ? await arkSubmitVideo(job.model, job.input as unknown as ArkVideoInput) : await submit(job.model, job.input, job.idempotencyKey);
    } catch (e) {
      // 供应商明确拒绝（4xx）：没有扣费，任务作废；网络错误：保持 submitting，下次用同一个幂等键续提
      if (e instanceof HiggsfieldError && e.status && e.status < 500) {
        updateJob(job.id, { status: "failed", error: e.message });
      } else if (isArkModel(job.model)) {
        // 方舟没有幂等键：重提可能重复扣费，所以不续提，让用户先去方舟控制台确认
        updateJob(job.id, { status: "unknown", error: `提交时网络断了，不知道方舟有没有收到，可能已扣 $${job.estUsd.toFixed(2)}。为了不重复扣费，先点「重新查一次」` });
      }
      throw e;
    }
    requestId = req.request_id;
    updateJob(job.id, { status: "submitted", requestId });
  }
  // Higgsfield 排队时常超过 10 分钟：后台多等一会儿，免得用户以为失败了
  const end = Date.now() + 30 * 60_000;
  let delay = 4000;
  for (;;) {
    let r: HfRequest & { tokens?: number };
    try {
      r = isArkModel(job.model) ? await arkGetTask(requestId) : await getStatus(requestId);
    } catch (e) {
      // 查进度时网络抖动/供应商 5xx：任务已提交，不重提，继续等
      const transient = e instanceof HiggsfieldError && (!e.status || e.status >= 500);
      if (e instanceof HiggsfieldError && e.status === 404) {
        updateJob(job.id, { status: "unknown", error: "供应商那边找不到这个任务（可能超过保留期被删了）：到控制台确认有没有扣费，再点「确认没扣费」或「放弃，按已扣费记账」" });
        throw e;
      }
      if (e instanceof HiggsfieldError && (e.status === 401 || e.status === 402 || e.status === 403))
        throw new HiggsfieldError("Key 失效或账号余额不足，任务可能还在生成：去「模型设置」换 Key 或充值后，点「继续等待」，不会重复扣费", e.status);
      if (!transient || Date.now() > end) throw e;
      await new Promise((res) => setTimeout(res, delay));
      delay = Math.min(15_000, Math.round(delay * 1.4));
      continue;
    }
    if (r.status === "completed") {
      const url = job.kind === "video" ? r.video?.url : r.images?.[0]?.url;
      if (!url) throw new HiggsfieldError("供应商没有返回文件，可稍后点“继续等待”");
      const res = await fetch(url).catch(() => {
        throw new HiggsfieldError("下载结果时网络中断，可稍后点“继续等待”，不会重复扣费");
      });
      if (!res.ok) throw new HiggsfieldError(`下载结果失败（HTTP ${res.status}），可稍后点“继续等待”`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type")?.split(";")[0] || (job.kind === "video" ? "video/mp4" : "image/png");
      const ext = job.kind === "video" ? "mp4" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      // 两个等待同时拿到结果时只记一次（从这里到 updateJob 都是同步的）
      if (getJob(job.id)?.status === "completed") return;
      saveJobOutput(job, bytes, ext, mime);
      const usd = isArkModel(job.model) && r.tokens ? Math.round(arkUsd(r.tokens) * 10000) / 10000 : job.estUsd;
      updateJob(job.id, { status: "completed", actualUsd: usd, error: null });
      const v = getShortVideo(job.videoId);
      const s = v?.shots.find((x) => x.id === job.shotId);
      if (v && s && job.kind === "scene") {
        const me = shotScene(v, s);
        if (me) {
          me.ver.refJobId = job.id;
          delete me.ver.refFromV;
          saveScene(me.sc);
        }
        addLedgerEntry({ projectId: job.projectId, shotCode: `${v.title} / 场地参考`, kind: "first_frame", model: job.model, usd, note: `短视频 · 场地空场景参考图${me ? ` · ${me.sc.name} v${me.ver.v}` : ""}` });
      } else if (v && s) {
        if (job.kind === "frame") {
          s.frameJobId = job.id;
          s.stage = "frame_ready";
          s.frameCheck = undefined;
        } else {
          s.videoJobId = job.id;
          s.stage = "video_ready";
          s.videoCheck = undefined;
        }
        saveShortVideo(v);
        addLedgerEntry({
          projectId: job.projectId,
          shotCode: `${v.title} / ${v.shots.indexOf(s) + 1}`,
          kind: job.kind === "video" ? "video" : "first_frame",
          model: job.model,
          usd,
          note: `短视频${job.reason ? ` · 重做原因：${job.reason}` : ""}`,
        });
      }
      if (!isArkModel(job.model)) await deleteRequest(requestId).catch(() => undefined);
      if (v && s && job.kind === "frame") await runFrameCheck(v.id, s.id, job.id, bytes);
      if (v && s && job.kind === "video") await runVideoCheck(v.id, s.id, job.id, bytes);
      return;
    }
    if (r.status === "failed" || r.status === "nsfw" || r.status === "canceled") {
      updateJob(job.id, { status: "failed", actualUsd: 0, error: r.status === "nsfw" ? "内容被审核拦截（不收费）" : `生成失败（不收费）${r.error ? `：${r.error}` : ""}` });
      throw new HiggsfieldError(r.status === "nsfw" ? "内容被审核拦截（不收费），请调整画面描述" : "生成失败（不收费），可调整后重试");
    }
    if (Date.now() > end) throw new HiggsfieldError("还在生成中，任务已保存；稍后点“继续等待”，不会重复扣费");
    await new Promise((res) => setTimeout(res, delay));
    delay = Math.min(15_000, Math.round(delay * 1.4));
  }
}

/** 导出：每个勾选的开头各出一条「开头 + 正文」；第一条同时存成 final.mp4 */
export async function renderShortAction(videoId: string): Promise<Result<StudioState>> {
  try {
    const v = load(videoId);
    const hooks = hooksOf(v);
    const picked = (v.exportHooks?.length ? hooks.filter((h) => v.exportHooks!.includes(h.id)) : hooks.slice(0, 1));
    const notReady = picked.filter((h) => hookParts(v, h).some((p) => p.stage !== "accepted"));
    const badCap = picked.flatMap((h) => captionIssues(h).map((m) => `「${h.hook?.name}」${m}`));
    if (badCap.length) throw new Error(badCap.join("；"));
    if (notReady.length) throw new Error(`这些开头还没采用：${notReady.map((h) => h.hook?.name).join("、")}`);
    if (!picked.length) await renderShort(v);
    for (const [k, h] of picked.entries()) {
      const out = await renderShort(v, hookFinalPath(v, h.id), h.id);
      if (k === 0) fs.copyFileSync(out, finalPath(v));
    }
    saveShortVideo(v);
    refresh(v);
    return { result: state(videoId) };
  } catch (e) {
    return fail(e);
  }
}

/** 大脑（Kimi）检查一镜要看的东西：最终提示词、3D 摆位、图片文件、这一镜的生成记录 */
export async function brainShotInputs(videoId: string, shotId: string) {
  const v = load(videoId);
  const s = v.shots.find((x) => x.id === shotId);
  if (!s) throw new Error("镜头不存在");
  const dir = videoDir(v.projectId, v.id);
  const fj = s.frameJobId ? getJob(s.frameJobId) : null;
  const frame = fj ? jobFilePath(fj) : null;
  const angle = angleRefPath(v, s);
  const comp = s.compFile ? path.join(dir, s.compFile) : null;
  return {
    product: productText(v.projectId),
    framePrompt: framePromptOf(v, s),
    videoPrompt: videoPromptOf(v, s),
    blocking: s.layout ? blockingText(s.layout, rigOf(v)) : "",
    comp: comp && fs.existsSync(comp) ? comp : null,
    frame: frame && fs.existsSync(frame) ? frame : null,
    angle: angle && fs.existsSync(angle) ? angle : null,
    refs: (await productRefFiles(v.projectId, v.colorId)).map((r) => r.file),
    jobs: listJobs(v.id)
      .filter((j) => j.shotId === s.id)
      .map((j) => ({ kind: j.kind, status: j.status, reason: j.reason, usd: j.actualUsd ?? j.estUsd, at: j.createdAt })),
  };
}

/** 3D 摆位换到另一台车：摄影机离看点的距离、看点高度（第 3 位是高度）、人偶离车的距离按握把高度比例缩放；产品姿势放平 */
function scaleLayout(l: NonNullable<ShortShot["layout"]>, k: number): NonNullable<ShortShot["layout"]> {
  const look: [number, number, number] = [l.lookAt[0], l.lookAt[1], l.lookAt[2] * k];
  const cam = [0, 1, 2].map((i) => look[i] + (l.camPos[i] - l.lookAt[i]) * k) as [number, number, number];
  return { ...l, camPos: cam, lookAt: look, bikeLift: 0, bikePitch: 0, bikeRoll: 0, bikeGround: 0, props: undefined, figures: l.figures?.map((f) => (f.onProduct ? f : { ...f, dx: f.dx * k, dy: f.dy * k })) };
}

/** 存为模板：正文 + 第一个开头的文字、机位、场地内容、家庭位、节日；整条视频级的返工问题并进每镜特殊要求。不存生成结果和花费 */
export async function saveTemplateAction(videoId: string, name: string): Promise<Result<string>> {
  try {
    const v = load(videoId);
    const nm = name.trim().slice(0, 40);
    if (!nm) throw new Error("给模板起个名字");
    const body = v.shots.filter((s) => !s.hook);
    if (!body.length) throw new Error("还没有正文镜头，先出分镜再存模板");
    const hook = hooksOf(v)[0];
    const pick = hook ? [hook, ...body] : body;
    const lessons = [...new Set(v.shots.flatMap((s) => (s.issues ?? []).filter((i) => i.scope === "video").map((i) => i.text.trim())).filter(Boolean))];
    const scenes: TemplateScene[] = [];
    const keys = new Map<string, string>();
    const keyOf = (s: ShortShot) => {
      const sh = s.scene;
      if (!sh) return null;
      const id = `${sh.id}:${sh.v}`;
      if (!keys.has(id)) {
        const sc = getScene(sh.id);
        if (!sc) return null;
        const key = String(scenes.length + 1);
        scenes.push({ key, name: sc.name, description: sc.description, special: sc.special, outdoor: sc.outdoor, items: versionOf(sc, sh.v).items.filter((i) => !i.theme) });
        keys.set(id, key);
      }
      return keys.get(id)!;
    };
    const vt = videoTheme(v);
    const shots: TemplateShot[] = pick.map((s) => ({
      beat: s.beat,
      useSeconds: s.useSeconds,
      trimStart: s.trimStart,
      genSeconds: s.genSeconds,
      description: s.description,
      camera: s.camera,
      caption: s.caption,
      productNote: s.productNote,
      compositeNote: s.compositeNote,
      operator: s.operator,
      framePrompt: s.framePrompt,
      motionPrompt: s.motionPrompt,
      layout: s.layout,
      family: s.family,
      special: [s.special, ...lessons].filter(Boolean).join("；").slice(0, 600),
      hook: s.hook ? { ...s.hook, name: "原版" } : undefined,
      sceneKey: keyOf(s),
    }));
    const id = createTemplate({ name: nm, v: 1, baseTemplateId: v.templateId, theme: vt.theme, themeText: vt.themeText, resolution: v.resolution, room: v.room, fromProduct: getProduct(v.projectId)?.name || "", fromKind: rideKindOf(getProduct(v.projectId)?.rideKind, getProduct(v.projectId)?.category), gripY: rigOf(v).gripY, scenes, shots });
    revalidatePath("/projects/[id]/shorts", "page");
    return { result: id };
  } catch (e) {
    return fail(e);
  }
}

/** 模板里一键换节日：还没生成任何画面，不花钱；存成新版本，已经套用过的视频不受影响 */
export async function setTemplateThemeAction(templateId: string, theme: string, themeText = ""): Promise<Result<true>> {
  try {
    const tp = getTemplate(templateId);
    if (!tp) throw new Error("模板不存在");
    const t = findTheme(theme).id;
    const text = t === "custom" ? themeText.trim().slice(0, 300) : "";
    if (t === "custom" && !text) throw new Error("自定义节日要写清楚是什么节日");
    tp.theme = t;
    tp.themeText = text || undefined;
    tp.v += 1;
    saveTemplate(tp);
    revalidatePath("/projects/[id]/shorts", "page");
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplateAction(templateId: string): Promise<Result<true>> {
  try {
    deleteTemplate(templateId);
    revalidatePath("/projects/[id]/shorts", "page");
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** 从模板新建：场地复制到这个产品下、3D 按车的握把高度缩放、全部回到构图草案（每镜要重新存 3D 构图），节日按这次选的 */
export async function createFromTemplateAction(projectId: string, templateId: string, title: string, theme: string, themeText = "", families?: Record<string, string>): Promise<Result<string>> {
  try {
    if (!findLocalProject(projectId)) throw new Error("项目不存在");
    const tp = getTemplate(templateId);
    if (!tp) throw new Error("模板不存在");
    requirePackaging(projectId, tp.baseTemplateId);
    const th = findTheme(theme).id;
    const text = th === "custom" ? themeText.trim().slice(0, 300) : "";
    if (th === "custom" && !text) throw new Error("自定义节日要写清楚是什么节日");
    const nm = title.trim().slice(0, 60) || `${tp.name} · ${listShortVideos(projectId).length + 1}`;
    const id = createShortVideo(projectId, nm, tp.baseTemplateId, { theme: th, themeText: text || undefined });
    const v = load(id);
    const m = getProductModel(projectId);
    const rig = (m && getRig(m.id)) || KB002_RIG;
    const k = Math.max(0.3, Math.min(3, rig.gripY / (tp.gripY || rig.gripY)));
    const scenes = new Map<string, Scene>();
    for (const t of tp.scenes) {
      scenes.set(t.key, createScene(projectId, { name: `${t.name}（${tp.name}）`.slice(0, 40), description: t.description, special: t.special, outdoor: t.outdoor, items: t.items, note: `从模板「${tp.name}」v${tp.v} 复制` }, []));
    }
    v.shots = tp.shots.map((t) => {
      const { sceneKey, layout, family, special, ...txt } = t;
      const s = cleanShot({ ...txt, id: undefined });
      s.layout = layout ? scaleLayout(layout, k) : null;
      const sc = sceneKey ? scenes.get(sceneKey) : undefined;
      if (sc) s.scene = themedScene(sc, sc.versions[sc.versions.length - 1].v, th, text);
      s.family = family;
      s.special = special;
      return s;
    });
    v.room = tp.room;
    v.resolution = tp.resolution;
    v.hooksReady = true;
    v.families = cleanFams(families);
    v.fromTemplate = { id: tp.id, v: tp.v, name: tp.name, fromProduct: tp.fromProduct, fromKind: tp.fromKind ?? rideKindOf(undefined, tp.fromProduct) };
    bindScenes(v);
    v.shots.forEach((s) => (s.textBasis = basisOf(s, placeOf(v, s))));
    saveShortVideo(v);
    refresh(v);
    return { result: id };
  } catch (e) {
    return fail(e);
  }
}

/** 套模板以后按这个产品改写全部镜头的文字（DeepSeek 文字调用 1 次，约 $0.01，不出图）；只在全部还是构图草案、没生成过时能用 */
export async function retargetTextAction(videoId: string): Promise<Result<{ notes: string[]; state: StudioState }>> {
  try {
    const v = load(videoId);
    const ft = v.fromTemplate;
    if (!ft) throw new Error("这条视频不是从模板套来的");
    if (ft.rewritten) throw new Error("已经改写过了；还要改就在镜头里逐镜改写");
    if (v.shots.some((s) => s.stage !== "draft")) throw new Error("有镜头已经确认构图，先退回构图再改写");
    if (listJobs(videoId).some((j) => j.status !== "failed")) throw new Error("这条视频已经生成过画面，不能整条改写");
    const p = getProduct(v.projectId);
    const kind = (k: string) => RIDE_KINDS.find((x) => x.k === k)?.label ?? k;
    const from = kind(rideKindOf(ft.fromKind, ft.fromProduct));
    const to = kind(rideKindOf(p?.rideKind, p?.category));
    const shots = v.shots.map((s) => ({ id: s.id, caption: s.caption, ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, s[k]])) }));
    // 字幕里没提到产品就原样保留（比如结尾引导评论的关键词）
    const productWords = /bike|balance|tricycle|trike|scooter|ride|riding|pedal|kriddo|seat|handlebar|平衡|三轮|车/i;
    const { data } = await chatJson({
      system:
        "You adapt the text of a TikTok-style product video that was written for one product (sourceProduct) to a different product (targetProduct). Change only what depends on the product: its name, type, parts, colors, materials, features, and how a child rides or uses it (a balance bike is pushed along with both feet on the ground and has no pedals; a tricycle is pedaled with the feet on the pedals and steered with the handlebars). Use only facts from targetProduct.facts; never invent features, logos, colors, stickers or accessories. Keep everything else as it is: story beats, people, wardrobe, location, holiday decorations, camera and framing, mood, the casual phone-footage style and roughly the same length. A sentence that does not mention the product stays word for word. Keep each field's scope: framePrompt must not gain positions, poses, distances or camera details. Fields description, camera and productNote are in Simplified Chinese; framePrompt, motionPrompt and caption are in English (caption: short casual American English, keep any 'POV:' prefix; a caption that does not mention the product, such as a comment keyword call to action, stays exactly as it is). Output json: {\"shots\":[{\"id\":\"\",\"description\":\"\",\"camera\":\"\",\"productNote\":\"\",\"framePrompt\":\"\",\"motionPrompt\":\"\",\"caption\":\"\",\"notes\":[\"one short Simplified Chinese line per change\"]}]} with every input shot, same ids, same order.",
      user: JSON.stringify({ sourceProduct: { name: ft.fromProduct, type: from }, targetProduct: { facts: productText(v.projectId), type: to }, shots }),
      maxTokens: 12_000,
      thinking: false,
      timeoutMs: 240_000,
    });
    const out = (data as { shots?: unknown[] } | null)?.shots;
    if (!Array.isArray(out) || !out.length) throw new AiError("AI 没有返回改写结果，请重试");
    const lim: Record<TextField, number> = { description: 600, camera: 200, productNote: 300, framePrompt: 2000, motionPrompt: 1000 };
    const notes: string[] = [];
    const caps = v.shots.map((s, i) => {
      const d = ((out.find((x) => (x as { id?: unknown })?.id === s.id) ?? out[i]) ?? {}) as Record<string, unknown>;
      for (const k of TEXT_FIELDS) {
        const x = d[k];
        if (typeof x === "string" && x.trim()) s[k] = x.trim().slice(0, lim[k]);
      }
      if (Array.isArray(d.notes)) d.notes.filter((n): n is string => typeof n === "string" && !!n.trim()).slice(0, 3).forEach((n) => notes.push(`#${i + 1} ${n.trim().slice(0, 120)}`));
      return typeof d.caption === "string" && d.caption.trim() && productWords.test(s.caption) ? d.caption.trim().slice(0, 160) : s.caption;
    });
    const en = await ensureEnglish(caps);
    v.shots.forEach((s, i) => {
      s.caption = en[i];
      s.textBasis = basisOf(s, placeOf(v, s));
    });
    v.fromTemplate = { ...ft, rewritten: true };
    saveShortVideo(v);
    refresh(v);
    return { result: { notes, state: state(videoId) } };
  } catch (e) {
    return fail(e);
  }
}
