import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOK_CASES, HOOK_EFFECTS, hookAss, PRESET_EFFECT, wrap } from "@/lib/hook-effects";
import { cleanHookData, PRESET_HOOKS } from "@/lib/hooks";
import { finalSeconds, hookParts, hooksOf, isExtraHook, shotSound, type ShortShot } from "@/lib/shorts";

test("预设 Hook 各用一种不同效果，每种效果都有带广告库链接的真实案例", () => {
  const fx = PRESET_HOOKS.map((h) => h.effect);
  assert.equal(new Set(fx).size, PRESET_HOOKS.length);
  for (const h of PRESET_HOOKS) assert.equal(PRESET_EFFECT[h.name], h.effect);
  for (const e of HOOK_EFFECTS) {
    assert.ok(HOOK_CASES[e.id].length >= 2, e.id);
    for (const c of HOOK_CASES[e.id]) assert.match(c.adId, /^\d{10,}$/);
  }
});

test("旧 Hook 数据没有效果：按名字补预设效果，不认识的用逐词大字", () => {
  assert.equal(cleanHookData({ name: "紧迫感" })?.effect, "ticker");
  assert.equal(cleanHookData({ name: "我的新套路" })?.effect, "claimWords");
  assert.equal(cleanHookData({ name: "我的新套路", effect: "comment" })?.effect, "comment");
});

test("每种效果生成的字幕不一样，且只在开头时长内", () => {
  const cap = "Black Friday deal: $59.99 (was $89.99)";
  const outs = HOOK_EFFECTS.map((e) => hookAss(e.id, cap, 3)!);
  assert.equal(new Set(outs.map((o) => o.split("[Events]")[1])).size, HOOK_EFFECTS.length);
  for (const o of outs) assert.doesNotMatch(o, /0:00:0[4-9]/);
  assert.equal(hookAss("priceBox", "  ", 3), null);
});

test("逐词出现：词数等于事件数；对比每 0.5 秒一个词；切成两段时第二段从 0 开始", () => {
  const claim = hookAss("claimWords", "one two three four", 3)!;
  assert.equal(claim.match(/^Dialogue:/gm)?.length, 4);
  const vs = hookAss("vsWords", "a b c", 3)!;
  assert.match(vs, /0:00:00\.50,0:00:01\.00/);
  const second = hookAss("priceBox", "Only $14", 3, 1.5)!;
  assert.match(second, /Dialogue: 0,0:00:00\.00,0:00:01\.50/);
  assert.deepEqual(wrap("aa bb cc dd", 5), ["aa bb", "cc dd"]);
});

test("声音默认关；视频开了才带；自拍开头强制带", () => {
  assert.equal(shotSound({}, { hook: { name: "x" } }), false);
  assert.equal(shotSound({ sound: true }, {}), true);
  assert.equal(shotSound({ sound: false }, { hook: { name: "x", selfie: true } }), true);
});

test("切镜后的第二段不算一种开头，但算进开头的时长；第二个开头的第二段也走单独预算", () => {
  const sh = (id: string, useSeconds: number, hook?: ShortShot["hook"]) => ({ id, useSeconds, hook }) as unknown as ShortShot;
  const v = { shots: [sh("a", 3, { name: "价格开场" }), sh("a2", 1.5, { name: "价格开场 · 切镜后", partOf: "a" }), sh("b", 2, { name: "大胆主张" }), sh("b2", 2, { name: "x", partOf: "b" }), sh("x", 4), sh("y", 3)] };
  assert.deepEqual(hooksOf(v).map((s) => s.id), ["a", "b"]);
  assert.deepEqual(hookParts(v, v.shots[0]).map((s) => s.id), ["a", "a2"]);
  assert.equal(finalSeconds(v), 3 + 1.5 + 4 + 3);
  assert.equal(isExtraHook(v, v.shots[1]), false);
  assert.equal(isExtraHook(v, v.shots[3]), true);
});

test("预置 Hook 照案例：价格开场默认自拍并切镜，先给结果一镜到底；关掉切镜存成 null", () => {
  const price = PRESET_HOOKS.find((h) => h.name === "价格开场")!;
  assert.equal(price.selfie, true);
  assert.ok(price.second && price.second.seconds > 0);
  assert.equal(PRESET_HOOKS.find((h) => h.name === "先给结果")!.second, null);
  assert.equal(cleanHookData({ ...price, second: null })?.second, null);
  assert.equal(cleanHookData(price)?.second?.seconds, price.second.seconds);
});

test("第二段跟着自拍开头开声音；旧 Hook 开头按名字补效果；字幕空 / 中文要提示", async () => {
  const { hookEffectOf } = await import("@/lib/shorts");
  const { captionIssues } = await import("@/lib/shorts-caption-check");
  const shots = [{ id: "a", hook: { name: "价格开场", selfie: true } }, { id: "a2", hook: { name: "x", partOf: "a" } }];
  assert.equal(shotSound({ sound: false, shots }, shots[1]), true);
  assert.equal(hookEffectOf({ name: "旧", libId: "l1", libName: "紧迫感" }), "ticker");
  assert.equal(hookEffectOf({ name: "原版" }), undefined);
  const h = { name: "价格开场", effect: "priceBox" as const };
  assert.equal(captionIssues({ hook: h, caption: " " }).length, 1);
  assert.equal(captionIssues({ hook: h, caption: "黑五特价 $59" }).length, 1);
  assert.equal(captionIssues({ hook: h, caption: "Black Friday: $59.99" }).length, 0);
});

test("车里自拍跟读字幕：台词每 3 个词一组，最后一个词紫底，切镜后顶部出卖点", () => {
  const a = hookAss("talkWords", "Folds flat in 3 seconds", 6, 0, { line: "one two three four five six", cut: 4 })!;
  assert.equal(a.match(/,Talk,/g)?.length, 6);
  assert.match(a, /\{\\rTalkHi\}one\{\\rTalk\} two three/);
  assert.match(a, /one two \{\\rTalkHi\}three\{\\rTalk\}/);
  assert.match(a, /0:00:04\.00,0:00:06\.00,TopBox/);
  assert.ok(hookAss("talkWords", "", 4, 0, { line: "hi there" }));
});
