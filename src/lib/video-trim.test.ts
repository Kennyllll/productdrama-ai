import { test } from "node:test";
import assert from "node:assert/strict";
import { trimAdvice } from "./video-trim";

const s = { trimStart: 0, useSeconds: 3, genSeconds: 4 };

test("问题在成片用的秒数以后：算通过，写明剪掉了", () => {
  const a = trimAdvice(["第 3.5 秒起：三轮车骑出画面右边"], s);
  assert.equal(a.keep.length, 0);
  assert.match(a.note, /剪掉/);
});

test("用的那段有问题、往前挪能避开：自动改 trimStart", () => {
  const a = trimAdvice(["第 3.5 秒起：车头出画"], { ...s, trimStart: 1 });
  assert.equal(a.trimStart, 0);
  assert.equal(a.keep.length, 0);
});

test("避不开：问题留着，提示改用几秒；没写时间的不动", () => {
  const a = trimAdvice(["第 2 秒起：车头出画"], s);
  assert.equal(a.keep.length, 1);
  assert.match(a.note, /改成 2/);
  assert.equal(trimAdvice(["Logo 变了"], s).keep.length, 1);
});
