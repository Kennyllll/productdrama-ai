"use server";

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cleanFamily, DAILY, lookLabel, portraitPrompt, portraitState, wearOf, WEAR_THEMES, type Family, type FamilyMember } from "@/lib/families";
import { addFamilyLedger, createFamily, deleteFamily, getFamily, portraitKey, portraitPath, saveFamily, updateMember } from "@/lib/families-repo";
import { deleteRequest, estimate, getStatus, HiggsfieldError, submit, uploadFile } from "@/lib/higgsfield";
import { FRAME_MODEL, FRAME_USD_FALLBACK } from "@/lib/shorts";
import { putFile, readFile } from "@/lib/storage";
import { adminError, currentActor, requireAdmin } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { addRevision } from "@/lib/revisions-repo";

const famData = (id: string) => {
  const f = getFamily(id);
  if (!f) return null;
  const { id: _i, updatedAt: _u, ...d } = f;
  void _i;
  void _u;
  return d;
};

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

/** 家庭库只有管理员能改；每次改动留一版，能回退 */
export async function saveFamilyAction(id: string | null, data: unknown): Promise<Result<string>> {
  try {
    const actor = await requireAdmin();
    const f = cleanFamily(data);
    if (!f) return { error: "家庭名字不能为空" };
    if (!f.members.length) return { error: "至少要有一个成员" };
    if (id) {
      const before = famData(id);
      if (!before) return { error: "家庭不存在" };
      saveFamily(id, f);
      addRevision({ entityType: "family", entityId: id, label: f.name, data: famData(id), op: "update", actor: actor.name, before });
    } else {
      id = createFamily(f);
      addRevision({ entityType: "family", entityId: id, label: f.name, data: famData(id), op: "create", actor: actor.name });
    }
    logAction(actor, { action: "修改家庭资料", detail: f.name, refId: id });
    revalidatePath("/families");
    return { result: id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFamilyAction(id: string): Promise<Result<true>> {
  try {
    const actor = await requireAdmin();
    const before = famData(id);
    if (!before || !deleteFamily(id)) return { error: "家庭不存在" };
    addRevision({ entityType: "family", entityId: id, label: before.name, data: before, op: "delete", actor: actor.name });
    logAction(actor, { action: "删除家庭", detail: `${before.name}（可在历史版本里恢复）`, refId: id });
    revalidatePath("/families");
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- 定妆照：每张先报价审批，后台出图，出好了再让用户采用 ----------

const IMG = { quality: "high", resolution: "2k", aspect_ratio: "9:16", enhance_prompt: false };

function target(familyId: string, memberId: string, look: string) {
  const f = getFamily(familyId);
  const m = f?.members.find((x) => x.id === memberId);
  if (!f || !m) throw new Error("成员不存在：先保存家庭");
  if (look !== DAILY && !WEAR_THEMES.some((t) => t.id === look)) throw new Error("造型不存在");
  if (!m.look.en) throw new Error(`先写 ${m.name} 的长相（英文）并保存`);
  if (look !== DAILY) {
    if (!m.themeWear[look]?.en) throw new Error(`先写 ${m.name} 的${lookLabel(look)}衣服（英文）并保存`);
    const st = portraitState(m, m.portraits?.[DAILY], DAILY);
    if (st === "none" || st === "stale") throw new Error(`先出并采用 ${m.name} 的平时定妆照：节日定妆照用它认脸，只换衣服`);
  }
  return { f, m };
}

async function unitUsd(): Promise<number> {
  try {
    const est = await estimate(FRAME_MODEL, { prompt: "estimate", ...IMG, aspect_ratio: "9:16" });
    if (Number.isFinite(est.usd) && est.usd > 0) return Math.round(est.usd * 10000) / 10000;
  } catch {
    /* 估价失败时用实测单价 */
  }
  return FRAME_USD_FALLBACK;
}

export async function quotePortraitAction(familyId: string, memberId: string, look: string): Promise<Result<{ usd: number; prompt: string }>> {
  try {
    const { f, m } = target(familyId, memberId, look);
    return { result: { usd: await unitUsd(), prompt: portraitPrompt(f, m, look, look !== DAILY) } };
  } catch (e) {
    return fail(e);
  }
}

const g = globalThis as unknown as { __portraitRuns?: Set<string> };
const runs = (g.__portraitRuns ??= new Set<string>());
const runKey = (familyId: string, memberId: string, look: string) => `${familyId}:${memberId}:${look}`;

export async function runPortraitAction(familyId: string, memberId: string, look: string, approvedUsd: number): Promise<Result<Family>> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "生成定妆照", detail: `${getFamily(familyId)?.name ?? ""} / ${memberId} / ${look}` });
  try {
    const { m } = target(familyId, memberId, look);
    if (m.portraitJobs?.[look] && !m.portraitJobs[look].error) throw new Error("这张正在出，等它完成");
    const usd = await unitUsd();
    if (Math.abs(usd - approvedUsd) > 0.005) throw new Error(`价格变了（$${approvedUsd.toFixed(2)} → $${usd.toFixed(2)}），请重新审批`);
    updateMember(familyId, memberId, (x) => {
      x.portraitJobs = { ...x.portraitJobs, [look]: { key: randomUUID(), usd, at: new Date().toISOString(), look: x.look.en, wear: wearOf(x, look === DAILY ? "none" : look) } };
    });
    void drivePortrait(familyId, memberId, look);
    return { result: getFamily(familyId)! };
  } catch (e) {
    return fail(e);
  }
}

/** 页面轮询（免费）：库里还有没跑完的任务就在后台接着等（断线 / 重启后续等，用原幂等键，不重复扣费） */
export async function familyStateAction(familyId: string): Promise<Family | null> {
  const f = getFamily(familyId);
  for (const m of f?.members ?? []) for (const [look, j] of Object.entries(m.portraitJobs ?? {})) if (!j.error && !runs.has(runKey(familyId, m.id, look))) void drivePortrait(familyId, m.id, look);
  return f;
}

async function drivePortrait(familyId: string, memberId: string, look: string) {
  const key = runKey(familyId, memberId, look);
  if (runs.has(key)) return;
  runs.add(key);
  const setErr = (msg: string) =>
    updateMember(familyId, memberId, (x) => {
      const j = x.portraitJobs?.[look];
      if (j) j.error = msg;
    });
  try {
    const f = getFamily(familyId);
    const m = f?.members.find((x) => x.id === memberId);
    const job = m?.portraitJobs?.[look];
    if (!f || !m || !job) return;
    let requestId = job.requestId;
    if (!requestId) {
      const base = look !== DAILY ? m.portraits?.[DAILY] : undefined;
      const urls = base && fs.existsSync(portraitPath(familyId, base)) ? [await uploadFile(readFile(portraitKey(familyId, base.file)), "image/png")] : [];
      const input = { prompt: portraitPrompt(f, m, look, urls.length > 0), ...(urls.length ? { image_urls: urls } : {}), ...IMG };
      try {
        requestId = (await submit(FRAME_MODEL, input, job.key)).request_id;
      } catch (e) {
        // 供应商明确拒绝（4xx）没扣费；网络错误留着下次用同一个幂等键续提
        if (e instanceof HiggsfieldError && e.status && e.status < 500) setErr(`出图被拒（不收费）：${e.message}`);
        throw e;
      }
      updateMember(familyId, memberId, (x) => {
        if (x.portraitJobs?.[look]) x.portraitJobs[look].requestId = requestId;
      });
    }
    const end = Date.now() + 10 * 60_000;
    let delay = 4000;
    for (;;) {
      const r = await getStatus(requestId).catch((e) => {
        if (e instanceof HiggsfieldError && e.status && e.status < 500) throw e;
        return null;
      });
      if (r?.status === "completed") {
        const url = r.images?.[0]?.url;
        if (!url) throw new HiggsfieldError("供应商没有返回图片");
        const res = await fetch(url);
        if (!res.ok) throw new HiggsfieldError(`下载定妆照失败（HTTP ${res.status}）`);
        const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
        const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
        const file = `${memberId}-${look}-${Date.now().toString(36)}.${ext}`;
        putFile(portraitKey(familyId, file), Buffer.from(await res.arrayBuffer()));
        const fam = getFamily(familyId);
        const who = fam?.members.find((x) => x.id === memberId);
        const paid = who?.portraitJobs?.[look]?.usd ?? 0;
        if (fam && who) addFamilyLedger({ familyId, family: fam.name, member: who.name, look: lookLabel(look), model: FRAME_MODEL, usd: paid });
        updateMember(familyId, memberId, (x) => {
          const j = x.portraitJobs?.[look];
          x.portraitDrafts = { ...x.portraitDrafts, [look]: { file, usd: j?.usd ?? 0, at: new Date().toISOString(), look: j?.look ?? x.look.en, wear: j?.wear ?? "" } };
          if (x.portraitJobs) delete x.portraitJobs[look];
        });
        await deleteRequest(requestId).catch(() => undefined);
        return;
      }
      if (r && (r.status === "failed" || r.status === "nsfw" || r.status === "canceled")) {
        setErr(r.status === "nsfw" ? "被审核拦截（不收费）" : `出图失败（不收费）${r.error ? `：${r.error}` : ""}`);
        return;
      }
      if (Date.now() > end) return; // 下次打开页面接着等
      await new Promise((ok) => setTimeout(ok, delay));
      delay = Math.min(15_000, Math.round(delay * 1.4));
    }
  } catch (e) {
    console.error("[portrait]", key, e instanceof Error ? e.message : e);
  } finally {
    runs.delete(key);
  }
}

function edit(familyId: string, memberId: string, fn: (m: FamilyMember) => void): Result<Family> {
  if (!updateMember(familyId, memberId, fn)) return { error: "成员不存在" };
  revalidatePath("/families");
  return { result: getFamily(familyId)! };
}

/** 采用：出好的这张变成这个造型的定妆照（首帧认人用它） */
export async function acceptPortraitAction(familyId: string, memberId: string, look: string): Promise<Result<Family>> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "采用定妆照", detail: `${getFamily(familyId)?.name ?? ""} / ${memberId} / ${look}` });
  return edit(familyId, memberId, (m) => {
    const d = m.portraitDrafts?.[look];
    if (!d) return;
    m.portraits = { ...m.portraits, [look]: d };
    delete m.portraitDrafts![look];
  });
}

/** 不要这张 / 清掉失败记录（已花的钱照记在被丢掉的照片上，不退） */
export async function discardPortraitAction(familyId: string, memberId: string, look: string): Promise<Result<Family>> {
  const noAdmin = await adminError();
  if (noAdmin) return { error: noAdmin };
  logAction(await currentActor(), { action: "丢弃定妆照", detail: `${getFamily(familyId)?.name ?? ""} / ${memberId} / ${look}` });
  return edit(familyId, memberId, (m) => {
    if (m.portraitDrafts?.[look]) delete m.portraitDrafts[look];
    if (m.portraitJobs?.[look]?.error) delete m.portraitJobs[look];
  });
}
