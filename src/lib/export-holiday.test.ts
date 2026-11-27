import { test } from "node:test";
import assert from "node:assert/strict";
import { holidayWarns } from "@/lib/export-check";
import type { ShortShot } from "@/lib/shorts";

const shot = (caption: string, hook = false) => ({ id: Math.random().toString(36).slice(2), beat: "x", stage: "accepted", caption, ...(hook ? { hook: { name: "原版" } } : {}) }) as unknown as ShortShot;

test("无节日的视频，字幕写 Santa：导出前提醒", () => {
  const w = holidayWarns({ theme: "none", shots: [shot("POV: Santa dropped this off early", true), shot("Comment 'SANTA' for the link!")] });
  assert.equal(w.length, 2);
  assert.match(w[0].why, /无节日/);
});

test("圣诞视频写 Santa 不提醒", () => {
  assert.equal(holidayWarns({ theme: "christmas", shots: [shot("POV: Santa dropped this off early", true)] }).length, 0);
});
