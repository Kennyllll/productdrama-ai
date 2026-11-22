import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateRun, fmtRemaining, median, pollDelay, pulseKey, type RunPulse } from "./run-poll";

const pulse = (over: Partial<RunPulse> = {}): RunPulse => ({ running: {}, videoAt: "a", jobsAt: "b|1", typical: {}, ...over });

test("pulseKey：什么都没变 → 一样；任务换步骤 / 有新任务 / 视频保存 → 不一样", () => {
  const r = { s1: { kind: "frame" as const, startedAt: 1, step: "prep" as const } };
  const base = pulseKey(pulse({ running: r }));
  assert.equal(pulseKey(pulse({ running: r, typical: { frame: 80 } })), base);
  assert.notEqual(pulseKey(pulse({ running: { s1: { ...r.s1, step: "gen" } } })), base);
  assert.notEqual(pulseKey(pulse({ running: r, jobsAt: "b|2" })), base);
  assert.notEqual(pulseKey(pulse({ running: r, videoAt: "c" })), base);
  assert.notEqual(pulseKey(pulse()), base);
});

test("pollDelay：越等越慢，后台暂停", () => {
  assert.equal(pollDelay(0, false), 2000);
  assert.equal(pollDelay(60_000, false), 4000);
  assert.equal(pollDelay(600_000, false), 8000);
  assert.equal(pollDelay(0, true), null);
});

test("median：忽略 0 和坏数据", () => {
  assert.equal(median([]), undefined);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 0, NaN, 2, 3]), 2.5);
});

test("estimateRun：进度随时间增加，最多 95%，超时提示比平时慢", () => {
  const t0 = 1_000_000;
  const a = estimateRun({ kind: "video", step: "prep", startedAt: t0, now: t0 + 10_000 });
  const b = estimateRun({ kind: "video", step: "gen", startedAt: t0, jobCreatedAt: t0 + 20_000, now: t0 + 200_000 });
  assert.ok(a.pct < b.pct);
  assert.equal(a.remainingSec, 340);
  assert.equal(b.remainingSec, 150);
  assert.equal(fmtRemaining(b), "预计还要约 3 分钟");
  const late = estimateRun({ kind: "video", step: "gen", startedAt: t0, jobCreatedAt: t0, now: t0 + 1_000_000 });
  assert.equal(late.pct, 95);
  assert.equal(late.slow, true);
  assert.match(fmtRemaining(late), /比平时慢/);
});

test("estimateRun：用最近实际用时代替默认值", () => {
  const t0 = 0;
  const e = estimateRun({ kind: "frame", step: "gen", startedAt: t0, jobCreatedAt: t0, now: 30_000, typicalSec: 40 });
  assert.equal(e.remainingSec, 10);
  assert.equal(fmtRemaining(e), "预计不到 1 分钟");
});
