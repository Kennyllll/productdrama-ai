import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBudgetChange, hashPin, PinLock, pinProblem, providerOf, signAdminToken, verifyAdminToken, verifyPin } from "@/lib/admin-core";

test("管理员 PIN：只存哈希，对的过、错的不过", () => {
  const h = hashPin("2468");
  assert.ok(!h.includes("2468"));
  assert.ok(verifyPin("2468", h));
  assert.ok(!verifyPin("1357", h));
  assert.ok(!verifyPin("2468", null));
  assert.ok(!verifyPin("2468", "garbage"));
  assert.equal(pinProblem("12"), "PIN 要 4–12 位数字");
  assert.equal(pinProblem("12ab"), "PIN 要 4–12 位数字");
  assert.equal(pinProblem("123456"), null);
});

test("管理员登录凭证：过期、改签名、换 secret 都失效", () => {
  const now = 1_000_000;
  const t = signAdminToken("s1", now, 1000);
  assert.ok(verifyAdminToken(t, "s1", now + 500));
  assert.ok(!verifyAdminToken(t, "s1", now + 1500));
  assert.ok(!verifyAdminToken(t, "s2", now + 500));
  assert.ok(!verifyAdminToken(t.replace(/.$/, (c) => (c === "a" ? "b" : "a")), "s1", now + 500));
  const [, sig] = t.split(".");
  assert.ok(!verifyAdminToken(`${now + 99999}.${sig}`, "s1", now + 500));
  assert.ok(!verifyAdminToken(undefined, "s1", now));
});

test("PIN 连续输错 5 次锁 60 秒，输对清零", () => {
  const l = new PinLock(5, 60_000);
  for (let i = 0; i < 4; i++) l.fail(0);
  assert.equal(l.wait(0), 0);
  l.fail(0);
  assert.equal(l.wait(1000), 59);
  assert.equal(l.wait(60_001), 0);
  l.fail(70_000);
  l.ok();
  for (let i = 0; i < 4; i++) l.fail(70_000);
  assert.equal(l.wait(70_000), 0);
});

test("预算：降低不要管理员；提高要原因和管理员；超过默认 1.5 倍要再确认；不能低于已花", () => {
  const base = { before: 10, defaultUsd: 10, spent: 4 };
  const down = checkBudgetChange({ ...base, after: 8 }, "", false);
  assert.equal(down.error, undefined);
  assert.equal(down.needsAdmin, false);
  assert.match(checkBudgetChange({ ...base, after: 3 }, "", false).error ?? "", /不能低于/);
  assert.match(checkBudgetChange({ ...base, after: 12 }, "", false).error ?? "", /写原因/);
  const up = checkBudgetChange({ ...base, after: 12 }, "客户加了一个开头", false);
  assert.equal(up.error, undefined);
  assert.equal(up.needsAdmin, true);
  assert.equal(up.big, false);
  assert.match(checkBudgetChange({ ...base, after: 16 }, "客户加了一个开头", false).error ?? "", /1\.5 倍/);
  const big = checkBudgetChange({ ...base, after: 16 }, "客户加了一个开头", true);
  assert.equal(big.error, undefined);
  assert.equal(big.big, true);
  assert.match(checkBudgetChange({ ...base, after: Number.NaN }, "", false).error ?? "", /正数/);
});

test("日志里的供应商按模型名推断", () => {
  assert.equal(providerOf("doubao-seedance-2-5-pro"), "火山方舟");
  assert.equal(providerOf("marketing-studio/image/sunburst"), "Higgsfield");
  assert.equal(providerOf("deepseek-chat"), "DeepSeek");
  assert.equal(providerOf("gemini-2.5-flash"), "Gemini");
  assert.equal(providerOf(""), "");
});
