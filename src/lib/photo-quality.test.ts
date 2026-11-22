import { test } from "node:test";
import assert from "node:assert/strict";
import { grayStats, photoWarnings } from "@/lib/photo-quality";

test("照片质量：太小、太暗、太亮、太糊", () => {
  assert.deepEqual(photoWarnings({ width: 3000, height: 4000, brightness: 200, sharpness: 20 }), []);
  assert.match(photoWarnings({ width: 800, height: 600, brightness: 200, sharpness: 20 })[0], /太小（800×600）/);
  assert.match(photoWarnings({ width: 3000, height: 3000, brightness: 30, sharpness: 20 })[0], /太暗/);
  assert.match(photoWarnings({ width: 3000, height: 3000, brightness: 250, sharpness: 20 })[0], /太亮/);
  assert.match(photoWarnings({ width: 3000, height: 3000, brightness: 200, sharpness: 1.5 })[0], /糊/);
});

test("清晰度：边缘清楚的图比糊图分高", () => {
  const w = 64;
  const sharpPx = new Uint8Array(w * w).map((_, i) => ((i % w >> 3) + ((i / w) >> 3)) % 2 ? 255 : 0);
  const flat = new Uint8Array(w * w).fill(128);
  const a = grayStats(sharpPx, w, w);
  const b = grayStats(flat, w, w);
  assert.ok(a.sharpness > 20);
  assert.equal(b.sharpness, 0);
  assert.equal(b.brightness, 128);
});
