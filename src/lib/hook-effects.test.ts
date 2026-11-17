import { test } from "node:test";
import assert from "node:assert/strict";
import { HOOK_CASES, HOOK_EFFECTS, hookAss, PRESET_EFFECT, wrap } from "@/lib/hook-effects";
import { cleanHookData, PRESET_HOOKS } from "@/lib/hooks";
import { finalSeconds, hookParts, hooksOf, isExtraHook, shotSound, type ShortShot } from "@/lib/shorts";

test("6 个预设 Hook 各用一种不同效果，每种效果都有带广告库链接的真实案例", () => {
  const fx = PRESET_HOOKS.map((h) => h.effect);
  assert.equal(new Set(fx).size, 6);
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
  assert.equal(new Set(outs.map((o) => o.split("[Events]")[1])).size, 6);
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
