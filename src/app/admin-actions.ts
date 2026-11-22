"use server";

import { revalidatePath } from "next/cache";
import { checkPin, currentActor, loginAdmin, logoutAdmin, requireAdmin, setAdminPin, setOperatorName, type Actor } from "@/lib/admin";
import { logAction } from "@/lib/audit-repo";
import { addApproval } from "@/lib/approvals-repo";
import { getShortVideo } from "@/lib/shorts-repo";

type Result<T> = { result?: T; error?: string };
const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

async function done(action: string, detail = ""): Promise<Result<Actor>> {
  const a = await currentActor();
  logAction(a, { action, detail });
  revalidatePath("/", "layout");
  return { result: a };
}

export async function whoAmIAction(): Promise<Actor> {
  return currentActor();
}

export async function setAdminPinAction(oldPin: string, newPin: string): Promise<Result<Actor>> {
  try {
    const had = (await currentActor()).pinSet;
    await setAdminPin(oldPin, newPin);
    return done(had ? "修改管理员 PIN" : "设置管理员 PIN", "PIN 本身不记");
  } catch (e) {
    return fail(e);
  }
}

export async function adminLoginAction(pin: string): Promise<Result<Actor>> {
  try {
    await loginAdmin(pin);
    return done("切换到管理员");
  } catch (e) {
    logAction(await currentActor(), { action: "管理员 PIN 输错", detail: e instanceof Error ? e.message : "" });
    return fail(e);
  }
}

export async function adminLogoutAction(): Promise<Result<Actor>> {
  await logoutAdmin();
  return done("切换回新手");
}

export async function setOperatorNameAction(name: string): Promise<Result<Actor>> {
  try {
    await setOperatorName(name);
    return done("改操作人名字", name.trim().slice(0, 20));
  } catch (e) {
    return fail(e);
  }
}

/** 超预算 / 超次数：管理员当场输 PIN + 写原因，放行这一次（15 分钟内、只能用一次、金额要对得上） */
export async function approveOverLimitAction(videoId: string, shotId: string, kind: string, usd: number, reason: string, pin: string): Promise<Result<true>> {
  try {
    const v = getShortVideo(videoId);
    const s = v?.shots.find((x) => x.id === shotId);
    if (!v || !s) throw new Error("镜头不存在");
    if (!["frame", "video", "scene"].includes(kind) || !Number.isFinite(usd) || usd < 0) throw new Error("参数不对");
    const why = (reason ?? "").trim();
    if (why.length < 4) throw new Error("放行要写原因（至少 4 个字）");
    checkPin(pin);
    const a = await currentActor();
    const name = a.role === "admin" ? a.name : "管理员";
    addApproval({ videoId, shotId, jobKind: kind, usd: Math.round(usd * 100) / 100, reason: why.slice(0, 200), actor: name });
    logAction({ role: "admin", name }, { projectId: v.projectId, videoId, shotId, shotLabel: s.hook ? `开头「${s.hook.name}」` : `#${v.shots.indexOf(s) + 1} ${s.beat}`, action: "管理员放行超限", detail: `${kind === "video" ? "视频" : kind === "frame" ? "首帧" : "场地参考图"}；原因：${why.slice(0, 200)}`, usd });
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}

/** 页面上判断要不要显示「需要管理员」用；真正的拦截在各个服务端动作里 */
export async function assertAdminAction(): Promise<Result<true>> {
  try {
    await requireAdmin();
    return { result: true };
  } catch (e) {
    return fail(e);
  }
}
