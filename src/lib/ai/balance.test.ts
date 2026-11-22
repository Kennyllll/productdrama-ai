import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBalance } from "@/lib/ai/balance";

test("DeepSeek 余额：可用且大于 0 才算够", () => {
  assert.deepEqual(parseBalance({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "12.3" }] }), { ok: true, text: "¥12.30" });
  assert.equal(parseBalance({ is_available: false, balance_infos: [{ currency: "USD", total_balance: "0.00" }] }).ok, false);
  assert.equal(parseBalance({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "0" }] }).ok, false);
  assert.equal(parseBalance({}).text, "未知");
});
