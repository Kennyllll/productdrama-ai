import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHookData, cleanHookValues, fillCaption, PRESET_HOOKS } from "@/lib/hooks";
import { buildHookLayout } from "@/lib/hook-stage";

test("预置 6 个 hook，清洗后不变", () => {
  assert.deepEqual(PRESET_HOOKS.map((h) => h.name), ["价格开场", "大胆主张", "先给结果", "紧迫感", "社会认同", "对比", "车里自拍"]);
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

test("Hook 3D 预设：产品不动，摄影机在车头前方，人面朝产品，按产品大小缩放", () => {
  const base = { lens: 26, camPos: [3, 3, 1.5] as [number, number, number], lookAt: [0, 0, 0.4] as [number, number, number], bike: [1, 2] as [number, number], bikeYaw: 0, aspect: 9 / 16, source: "x" };
  const head = buildHookLayout({ dist: 2, camH: 1, lens: 28, view: "head", people: [{ kind: "child", pose: "ride", onProduct: true }, { kind: "adult", pose: "stand", side: "right", dist: 1 }] }, base, 0.51);
  assert.deepEqual(head.bike, [1, 2]);
  assert.deepEqual(head.camPos, [1, 4, 1]);
  assert.equal(head.figures?.[0].onProduct, true);
  const adult = head.figures![1];
  assert.deepEqual([adult.dx, adult.dy], [1, 0]);
  assert.equal(adult.yaw, -90);
  const big = buildHookLayout({ dist: 2, camH: 1, lens: 28, view: "head", people: [] }, base, 1.02);
  assert.deepEqual(big.camPos, [1, 6, 1]);
  for (const h of PRESET_HOOKS) assert.ok(h.stage, h.name);
});
