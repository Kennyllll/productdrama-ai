import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStoryIssues, storyBlock, storyHash, storyRewrites, storyStale } from "@/lib/story-check";
import type { ShortShot, ShortVideoData } from "@/lib/shorts";

const shot = (id: string, caption: string, stage = "draft") => ({ id, beat: "b", stage, caption, description: "d", camera: "", productNote: "", framePrompt: "", motionPrompt: "" }) as unknown as ShortShot;
const vid = (): Pick<ShortVideoData, "shots" | "theme" | "themeText" | "families" | "storyCheck"> => ({ theme: "custom", themeText: "Boxing Day", shots: [shot("a", "But this trike has a parent handle!"), shot("b", "Ok", "comp_ok")] });

test("剧本改过：上次对账作废，不拦", () => {
  const v = vid();
  v.storyCheck = { hash: storyHash(v), at: "", pass: false, issues: [{ shotId: "b", kind: "holiday", quote: "Father's Day", why: "节日是 Boxing Day" }], fixed: [], usd: 0 };
  assert.equal(storyStale(v), false);
  assert.match(storyBlock(v, "b"), /Father's Day.*退回构图/);
  assert.equal(storyBlock(v, "a"), "");
  assert.equal(storyBlock(v, "b", "video"), "", "首帧已出：问题不在动作和字幕里，出视频不拦");
  v.shots[1].caption = "Get yours for Father's Day";
  v.storyCheck.hash = storyHash(v);
  assert.match(storyBlock(v, "b", "video"), /Father's Day/);
  v.shots[1].caption = "Get yours today.";
  assert.equal(storyStale(v), true);
  assert.equal(storyBlock(v, "b"), "");
});

test("K3 返回：不认识的镜头和种类丢掉；只改还在写剧本、而且有问题的镜头", () => {
  const v = vid();
  const issues = parseStoryIssues([{ shotId: "a", kind: "feature", quote: "parent handle", why: "产品没有推杆" }, { shotId: "x", kind: "feature", why: "?" }, { shotId: "a", kind: "style", why: "?" }], v);
  assert.equal(issues.length, 1);
  const rw = storyRewrites([{ shotId: "a", caption: "Quiet EVA wheels." }, { shotId: "b", caption: "x" }], v, [...issues, { shotId: "b", kind: "holiday", quote: "", why: "x" }]);
  assert.deepEqual(rw, [{ shotId: "a", fields: { caption: "Quiet EVA wheels." } }]);
});
