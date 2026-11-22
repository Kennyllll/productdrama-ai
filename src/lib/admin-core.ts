// 新手 / 管理员：PIN 校验、登录凭证、预算改动规则。纯函数，方便测试（服务端读写在 admin.ts）
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { BUDGET_BIG_RATIO } from "@/lib/admin-labels";
export { BUDGET_BIG_RATIO, NEED_ADMIN, ROLE_LABEL, type Role } from "@/lib/admin-labels";
/** 管理员登录多久后自动退回新手 */
export const ADMIN_TTL_MS = 4 * 60 * 60_000;
/** 连续输错几次后锁一会儿 */
export const PIN_MAX_TRIES = 5;
export const PIN_LOCK_MS = 60_000;
/** 管理员放行超预算 / 超次数的批准多久内有效 */
export const APPROVAL_TTL_MS = 15 * 60_000;

/** PIN：4–12 位数字 */
export function pinProblem(pin: unknown): string | null {
  if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) return "PIN 要 4–12 位数字";
  return null;
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  return `scrypt$${salt}$${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  const [alg, salt, hash] = (stored ?? "").split("$");
  if (alg !== "scrypt" || !salt || !hash || typeof pin !== "string") return false;
  const a = Buffer.from(scryptSync(pin, salt, 32).toString("hex"));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 管理员登录凭证：到期时间 + 签名（改了 PIN 换 secret，旧凭证全部作废） */
export function signAdminToken(secret: string, now = Date.now(), ttl = ADMIN_TTL_MS): string {
  const exp = String(now + ttl);
  return `${exp}.${createHmac("sha256", secret).update(`admin:${exp}`).digest("hex")}`;
}

export function verifyAdminToken(token: string | undefined, secret: string | null | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`admin:${exp}`).digest("hex"));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** 输错 PIN 锁定：key 一般就是 "pin"（本机单人用） */
export class PinLock {
  private fails = 0;
  private until = 0;
  constructor(private max = PIN_MAX_TRIES, private lockMs = PIN_LOCK_MS) {}
  /** 还要等几秒；0 = 可以试 */
  wait(now = Date.now()): number {
    return this.until > now ? Math.ceil((this.until - now) / 1000) : 0;
  }
  fail(now = Date.now()) {
    this.fails += 1;
    if (this.fails >= this.max) {
      this.until = now + this.lockMs;
      this.fails = 0;
    }
  }
  ok() {
    this.fails = 0;
    this.until = 0;
  }
}

export interface BudgetChange {
  /** 改前实际生效的预算 */
  before: number;
  /** 改后实际生效的预算 */
  after: number;
  /** 默认预算（成片秒数 × 每秒上限） */
  defaultUsd: number;
  /** 已花 + 生成中占用 */
  spent: number;
}

export interface BudgetVerdict {
  error?: string;
  raise: boolean;
  /** 提高时要管理员 PIN 和原因 */
  needsAdmin: boolean;
  /** 超过默认预算 1.5 倍：要再勾一次确认 */
  big: boolean;
}

/** 预算改动的规则：不能低于已花；降低谁都可以；提高要管理员 + 原因；超过默认 1.5 倍要再确认 */
export function checkBudgetChange(c: BudgetChange, reason: string, bigConfirmed: boolean): BudgetVerdict {
  const raise = c.after > c.before + 1e-9;
  const big = raise && c.after > c.defaultUsd * BUDGET_BIG_RATIO + 1e-9;
  const out: BudgetVerdict = { raise, needsAdmin: raise, big };
  if (!Number.isFinite(c.after) || c.after < 0) return { ...out, error: "预算要填一个正数" };
  if (c.after + 1e-9 < c.spent) return { ...out, error: `预算不能低于已花和生成中占用的 $${c.spent.toFixed(2)}` };
  if (raise && reason.trim().length < 4) return { ...out, error: "提高预算要写原因（至少 4 个字）" };
  if (big && !bigConfirmed) return { ...out, error: `新预算超过默认预算 $${c.defaultUsd.toFixed(2)} 的 ${BUDGET_BIG_RATIO} 倍，请勾选再确认一次` };
  return out;
}

/** 供应商：从模型名推断（日志里显示走哪家） */
export function providerOf(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("seedance") || m.startsWith("doubao")) return "火山方舟";
  if (m.includes("gemini")) return "Gemini";
  if (m.includes("deepseek")) return "DeepSeek";
  if (m.includes("kimi") || m.includes("moonshot")) return "Kimi";
  if (m.includes("fal")) return "fal";
  return m ? "Higgsfield" : "";
}
