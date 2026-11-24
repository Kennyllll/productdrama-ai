import assert from "node:assert/strict";
import test from "node:test";
import { bestYaw, maskOf, mirror, overlap, photoFg } from "./silhouette";

/** 白底上画一个 L 形（左边高、右边矮），像车：后面高靠背、前面矮 */
function img(w: number, h: number, flip = false) {
  const px = new Uint8Array(w * h * 4).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const xx = flip ? w - 1 - x : x;
      const on = (xx >= 10 && xx < 20 && y >= 10 && y < 50) || (xx >= 10 && xx < 70 && y >= 40 && y < 50);
      if (on) px.set([20, 20, 20, 255], (y * w + x) * 4);
    }
  return px;
}

test("same shape overlaps fully, mirrored shape much less", () => {
  const a = img(80, 60), b = img(80, 60, true);
  const fa = maskOf(a, 80, 60, photoFg(a, 80, 60))!, fb = maskOf(b, 80, 60, photoFg(b, 80, 60))!;
  assert.ok(overlap(fa, fa) > 0.99);
  assert.ok(overlap(fa, fb) < 0.6);
  assert.ok(overlap(fa, mirror(fb)) > 0.85);
});

test("blank image has no mask", () => {
  const w = new Uint8Array(10 * 10 * 4).fill(255);
  assert.equal(maskOf(w, 10, 10, photoFg(w, 10, 10)), null);
});

test("bestYaw keeps 0 unless clearly better", () => {
  assert.equal(bestYaw({ 0: [0.7], 90: [0.3], [-90]: [0.3], 180: [0.72] } as never)?.yaw, 0);
  assert.equal(bestYaw({ 0: [0.4], 90: [0.3], [-90]: [0.3], 180: [0.8] } as never)?.yaw, 180);
  assert.equal(bestYaw({ 0: [], 90: [], [-90]: [], 180: [] } as never), null);
});
