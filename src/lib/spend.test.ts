import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyShortData, type GenJob, type ShortShot } from "@/lib/shorts";
import { buildSnapshot, currentMediaUsd, missingBody, replaceLoss, shotsSpend } from "@/lib/spend";

const shot = (id: string, p: Partial<ShortShot> = {}): ShortShot => ({
  id,
  beat: id,
  useSeconds: 2,
  trimStart: 0,
  genSeconds: 4,
  description: "",
  camera: "",
  caption: `cap ${id}`,
  productNote: "",
  compositeNote: "",
  framePrompt: "",
  motionPrompt: "",
  stage: "accepted",
  layout: null,
  compFile: null,
  frameJobId: `f-${id}`,
  videoJobId: `v-${id}`,
  checkNote: "",
  ...p,
});
const job = (id: string, shotId: string, kind: GenJob["kind"], usd: number, p: Partial<GenJob> = {}): GenJob => ({
  id,
  videoId: "vid",
  shotId,
  kind,
  model: kind === "video" ? "doubao-seedance" : "marketing-studio/image/sunburst",
  paramsHash: "",
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
  ...p,
});

test("一镜花了多少：失败和测试不算，返工的都算", () => {
  const jobs = [job("f-a", "a", "frame", 0.1), job("v-a", "a", "video", 1.2), job("x", "a", "video", 1.2, { status: "failed" }), job("t", "a", "frame", 0.1, { isTest: true }), job("old", "a", "video", 1.2)];
  assert.equal(shotsSpend(jobs, ["a"]), 2.5);
  assert.deepEqual(currentMediaUsd(jobs, shot("a")), { frame: 0.1, video: 1.2 });
  assert.equal(replaceLoss(jobs, shot("a"), "video"), 1.2);
  assert.equal(replaceLoss(jobs, shot("a", { frameJobId: null }), "frame"), 0);
});

test("正式导出：正文有没采用的镜头要列出来，不能静默跳过", () => {
  const v = { ...emptyShortData(), shots: [shot("h", { hook: { name: "开头 A" } }), shot("a"), shot("b", { stage: "video_ready" }), shot("c", { videoJobId: null })] };
  assert.deepEqual(missingBody(v), ["#3 b", "#4 c"]);
  assert.deepEqual(missingBody({ shots: [shot("a")] }), []);
});

test("成片快照：记下开头、每镜首帧和视频版本、字幕、价格依据", () => {
  const h = shot("h", { hook: { name: "开头 A", libId: "lib1" }, caption: "Only $99" });
  const v = { ...emptyShortData(), captions: true, shots: [h, shot("h2", { hook: { name: "开头 A", partOf: "h" } }), shot("a"), shot("b")] };
  const jobs = [job("f-h", "h", "frame", 0.1), job("v-h", "h", "video", 1), job("f-h2", "h2", "frame", 0.1), job("v-h2", "h2", "video", 1), job("f-a", "a", "frame", 0.1), job("v-a", "a", "video", 1, { actualUsd: null }), job("f-b", "b", "frame", 0.1), job("v-b", "b", "video", 1), job("redo", "a", "video", 1)];
  const s = buildSnapshot(v, h, jobs);
  assert.equal(s.hook?.name, "开头 A");
  assert.equal(s.hook?.caption, "Only $99");
  assert.deepEqual(s.shots.map((x) => x.id), ["h", "h2", "a", "b"]);
  assert.equal(s.shots[2].videoJobId, "v-a");
  assert.equal(s.shots[2].caption, "cap a");
  assert.equal(s.seconds, 8);
  assert.equal(s.mediaUsd, 4.4);
  assert.equal(s.videoSpentUsd, 5.4);
  assert.match(s.priceBasis, /估价/);
  assert.equal(s.captions, true);
});
