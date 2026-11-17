import { test } from "node:test";
import assert from "node:assert/strict";
import { finalSeconds, hookBudget, quoteJob, shotCuts, waitingFor, type GenJob, type ShortShot, type ShortVideoData } from "./shorts";

const shot = (id: string, p: Partial<ShortShot> = {}): ShortShot => ({
  id,
  beat: id,
  useSeconds: 3,
  trimStart: 0,
  genSeconds: 4,
  description: "d",
  camera: "",
  caption: "",
  productNote: "",
  compositeNote: "",
  framePrompt: "x".repeat(30),
  motionPrompt: "",
  stage: "draft",
  layout: null,
  compFile: null,
  frameJobId: null,
  videoJobId: null,
  checkNote: "",
  ...p,
});

const video = (shots: ShortShot[]): ShortVideoData => ({
  templateId: "pov-gift",
  brief: "",
  concepts: [],
  conceptId: null,
  shots,
  room: "living",
  resolution: "720p",
  budgetUsd: null,
});

const job = (shotId: string, usd: number): GenJob => ({
  id: `j-${shotId}-${usd}`,
  videoId: "v",
  shotId,
  kind: "video",
  model: "m",
  paramsHash: "h",
  seconds: 4,
  estUsd: usd,
  actualUsd: usd,
  status: "completed",
  requestId: null,
  reason: "",
  isTest: false,
  hasOutput: true,
  error: null,
  createdAt: "",
});

test("开头不参与正文顺序锁，正文只等正文", () => {
  const v = video([shot("h1", { hook: { name: "原版" } }), shot("h2", { hook: { name: "价格" } }), shot("b1"), shot("b2")]);
  assert.equal(waitingFor(v, "h2"), 0);
  assert.equal(waitingFor(v, "b1"), 0);
  assert.equal(waitingFor(v, "b2"), 3);
});

test("成片秒数 = 正文 + 一个开头", () => {
  const v = video([shot("h1", { hook: { name: "a" }, useSeconds: 3 }), shot("h2", { hook: { name: "b" }, useSeconds: 4 }), shot("b1", { useSeconds: 5 })]);
  assert.equal(finalSeconds(v), 8);
});

test("一段视频按剪辑点剪成 2 个镜头", () => {
  assert.deepEqual(shotCuts(shot("a", { useSeconds: 3, trimStart: 0.5, hook: { name: "a", cut: 1.5, zoomB: 1.35 } })), [
    { start: 0.5, len: 1.5, zoom: 1 },
    { start: 2, len: 1.5, zoom: 1.35 },
  ]);
  assert.equal(shotCuts(shot("b", { hook: { name: "b" } })).length, 1);
  assert.equal(shotCuts(shot("c", { useSeconds: 3, hook: { name: "c", cut: 2.9 } })).length, 1);
});

test("额外开头单独预算，不占正文预算；超了要勾超限", () => {
  const extra = shot("h2", { hook: { name: "价格" }, stage: "frame_ok", frameJobId: "f" });
  const v = video([shot("h1", { hook: { name: "原版" } }), extra, shot("b1")]);
  const jobs = [job("b1", 1.4)];
  const base = { kind: "video" as const, shot: extra, video: { ...v, budgetUsd: 1.5 }, paramsHash: "new", unitUsd: 0.2647, seconds: 4, reason: "", overLimit: false };
  const q = quoteJob({ ...base, jobs });
  assert.equal(q.budget, hookBudget(extra));
  assert.equal(q.blocked.length, 0, q.blocked.join("|"));
  const over = quoteJob({ ...base, jobs: [...jobs, { ...job("h2", 1.5), kind: "frame", paramsHash: "old" }] });
  assert.ok(over.needsOverLimit);
  assert.ok(over.blocked.some((b) => b.includes("这个开头的预算")));
  assert.ok(!quoteJob({ ...base, jobs: [...jobs, { ...job("h2", 1.5), kind: "frame", paramsHash: "old" }], overLimit: true }).blocked.some((b) => b.includes("预算")));
});
