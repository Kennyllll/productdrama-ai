import test from "node:test";
import assert from "node:assert/strict";
import { cleanShotNotes } from "@/lib/prompt-clean";

test("补充文字里的衣服和自拍时的电影画风由程序删掉", () => {
  const n = "9:16 vertical front-camera shot. Adult with eyes wide in surprise and one hand over their mouth, wearing a soft old t-shirt and faded jeans with running shoes; natural morning light, cool Boxing Day daylight";
  const r = cleanShotNotes(n, { wardrobe: true, selfie: true });
  assert.ok(!/t-shirt|jeans/.test(r.text));
  assert.ok(/eyes wide/.test(r.text) && /morning light/.test(r.text));
  assert.equal(r.dropped.length, 1);
  assert.ok(!/cinematic/.test(cleanShotNotes("warm light, cinematic shallow depth of field", { wardrobe: false, selfie: true }).text));
  assert.equal(cleanShotNotes("wearing a red coat", { wardrobe: false, selfie: false }).text, "wearing a red coat");
});
