import test from "node:test";
import assert from "node:assert/strict";
import { cleanCarDraft, cleanShotNotes } from "@/lib/prompt-clean";

test("补充文字里的衣服和自拍时的电影画风由程序删掉", () => {
  const n = "9:16 vertical front-camera shot. Adult with eyes wide in surprise and one hand over their mouth, wearing a soft old t-shirt and faded jeans with running shoes; natural morning light, cool Boxing Day daylight";
  const r = cleanShotNotes(n, { wardrobe: true, selfie: true });
  assert.ok(!/t-shirt|jeans/.test(r.text));
  assert.ok(/eyes wide/.test(r.text) && /morning light/.test(r.text));
  assert.equal(r.dropped.length, 1);
  assert.ok(!/cinematic/.test(cleanShotNotes("warm light, cinematic shallow depth of field", { wardrobe: false, selfie: true }).text));
  assert.equal(cleanShotNotes("wearing a red coat", { wardrobe: false, selfie: false }).text, "wearing a red coat");
});

test("AI 写的人物外貌（年龄、头发、衣服）和反光词从出图补充文字里删掉，产品和动作留着", () => {
  const r = cleanShotNotes("Zoe (2.5) with golden curls, in striped short sleeves and shorts, small sandals, sits on the saddle of a white KRIDDO TC003 tricycle, morning light glinting off the frame, riding steadily", { wardrobe: true, selfie: false }).text;
  assert.ok(!/2\.5|curls|sleeves|sandals|glint/i.test(r), r);
  assert.ok(/white KRIDDO TC003 tricycle/.test(r) && /riding steadily/.test(r), r);
});

test("车里自拍草稿：脸的左右改成中间，衣服删掉", () => {
  const en = cleanCarDraft("Her face and shoulders fill the foreground on the right side of the frame, and she looks into the front camera. She wears an old T-shirt and jeans. Sunlight comes in.", "en");
  assert.ok(!/\bright\b/i.test(en), en);
  assert.ok(/middle of the frame/.test(en), en);
  assert.ok(!/T-shirt|jeans/i.test(en), en);
  assert.ok(/Sunlight/.test(en), en);
  const zh = cleanCarDraft("Maya 坐在驾驶座上，脸在画面右边，穿旧T恤和牛仔裤，对着镜头说话。", "zh");
  assert.equal(zh, "Maya 坐在驾驶座上，脸在画面中间，对着镜头说话。");
});
