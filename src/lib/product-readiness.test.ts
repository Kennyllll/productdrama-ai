import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBible } from "@/lib/mock/demo";
import { gapsText, productGaps } from "@/lib/product-readiness";
import type { LocalProduct } from "@/lib/types";

const filled: LocalProduct = {
  name: "测试三轮车",
  category: "儿童三轮车",
  sellingPoints: ["可折叠"],
  bible: emptyBible.map((f) => ({ ...f, value: f.key === "age" ? "1–3 岁" : "测试值", needsConfirmation: !["color-main", "size", "age"].includes(f.key) })),
};

test("产品资料齐了才能建短视频", () => {
  assert.deepEqual(productGaps(filled, ["正面", "左侧", "背面", "右侧"], false), []);
  assert.deepEqual(productGaps(filled, [], true), []);
  const g = productGaps({ ...filled, name: "" }, ["正面"], false);
  assert.deepEqual(g.map((x) => x.step), [1, 2]);
  assert.match(gapsText(g), /左侧、背面、右侧照/);
});

test("必须确认的细节：没填或没勾都算缺", () => {
  const bible = filled.bible.map((f) => (f.key === "size" ? { ...f, value: "" } : f.key === "age" ? { ...f, needsConfirmation: true } : f));
  const g = productGaps({ ...filled, bible }, [], true);
  assert.equal(g.length, 1);
  assert.match(g[0].text, /尺寸、适用年龄/);
  assert.equal(productGaps(null, [], false)[0].step, 1);
});
