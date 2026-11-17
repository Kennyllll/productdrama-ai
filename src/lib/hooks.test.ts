import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHookData, cleanHookValues, fillCaption, PRESET_HOOKS } from "@/lib/hooks";

test("预置 6 个 hook，清洗后不变", () => {
  assert.deepEqual(PRESET_HOOKS.map((h) => h.name), ["价格开场", "大胆主张", "先给结果", "紧迫感", "社会认同", "对比"]);
  for (const h of PRESET_HOOKS) assert.deepEqual(cleanHookData(h), h);
  assert.equal(cleanHookData({ name: " " }), null);
  assert.deepEqual(cleanHookData({ name: "x", fields: [{ key: "a", label: "A" }, { key: "a", label: "B" }, { key: "product", label: "P" }] })?.fields.map((f) => f.label), ["A"]);
});

test("字幕按属性填，空值不留残渣", () => {
  const price = PRESET_HOOKS[0];
  const v = cleanHookValues(price, { price: "$49.99" });
  assert.equal(v.price, "$49.99");
  assert.equal(v.was, "$89.99");
  assert.equal(fillCaption(price.caption, v, "KRIDDO"), "Black Friday deal: $49.99 (was $89.99)");
  assert.equal(fillCaption("{deadline} · {stock}", { deadline: "Ends tonight", stock: "" }, ""), "Ends tonight");
  assert.equal(fillCaption("{vs} vs {product}", { vs: "a metal trike" }, "KRIDDO TC003"), "a metal trike vs KRIDDO TC003");
});
