// 本机身份：管理员 PIN 存在 settings（只存哈希），登录凭证放 httpOnly cookie。所有要权限的服务端动作都走 requireAdmin()
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { ADMIN_TTL_MS, hashPin, NEED_ADMIN, PinLock, pinProblem, signAdminToken, verifyAdminToken, verifyPin, type Role } from "@/lib/admin-core";

const COOKIE = "pd_admin";
const NAME_COOKIE = "pd_operator";

const g = globalThis as unknown as { __pdPinLock?: PinLock };
const lock = () => (g.__pdPinLock ??= new PinLock());

function getSetting(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
function setSetting(key: string, value: string) {
  getDb().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export const hasAdminPin = () => Boolean(getSetting("admin_pin"));

export interface Actor {
  role: Role;
  /** 操作人名字（本机自己填，没填就是「新手」/「管理员」） */
  name: string;
  /** 还没设管理员 PIN：第一次用，谁都能设 */
  pinSet: boolean;
}

export async function currentActor(): Promise<Actor> {
  const jar = await cookies();
  const pinSet = hasAdminPin();
  const role: Role = pinSet && verifyAdminToken(jar.get(COOKIE)?.value, getSetting("admin_secret")) ? "admin" : "novice";
  const raw = decodeURIComponent(jar.get(NAME_COOKIE)?.value ?? "").trim().slice(0, 20);
  return { role, name: raw || (role === "admin" ? "管理员" : "新手"), pinSet };
}

/** 没设 PIN 时也当作新手：必须先设 PIN 才有管理员 */
export async function requireAdmin(): Promise<Actor> {
  const a = await currentActor();
  if (a.role !== "admin") throw new Error(NEED_ADMIN);
  return a;
}

/** 当场校验一次 PIN（调高预算、超预算放行这种花钱的事，即使已登录也要再输一次） */
export function checkPin(pin: string): void {
  const wait = lock().wait();
  if (wait) throw new Error(`PIN 输错太多次，请 ${wait} 秒后再试`);
  if (!verifyPin(pin, getSetting("admin_pin"))) {
    lock().fail();
    throw new Error(hasAdminPin() ? "管理员 PIN 不对" : "还没设管理员 PIN：先到「设置 → 身份」设一个");
  }
  lock().ok();
}

async function grant() {
  const secret = getSetting("admin_secret");
  if (!secret) return;
  (await cookies()).set(COOKIE, signAdminToken(secret), { httpOnly: true, sameSite: "strict", path: "/", maxAge: ADMIN_TTL_MS / 1000 });
}

/** 设 / 改 PIN：第一次谁都能设；改 PIN 要旧 PIN。换 secret 让旧登录全部失效 */
export async function setAdminPin(oldPin: string, newPin: string): Promise<void> {
  const bad = pinProblem(newPin);
  if (bad) throw new Error(bad);
  if (hasAdminPin()) checkPin(oldPin);
  setSetting("admin_pin", hashPin(newPin));
  setSetting("admin_secret", randomBytes(32).toString("hex"));
  await grant();
}

export async function loginAdmin(pin: string): Promise<void> {
  checkPin(pin);
  await grant();
}

export async function logoutAdmin(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function setOperatorName(name: string): Promise<void> {
  const n = name.trim().slice(0, 20);
  const jar = await cookies();
  if (n) jar.set(NAME_COOKIE, encodeURIComponent(n), { sameSite: "strict", path: "/", maxAge: 365 * 86400 });
  else jar.delete(NAME_COOKIE);
}

/** 给返回 { error } 的旧动作用：不是管理员就返回原因 */
export async function adminError(): Promise<string | null> {
  return (await currentActor()).role === "admin" ? null : NEED_ADMIN;
}
