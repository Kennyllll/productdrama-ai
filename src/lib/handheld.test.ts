import assert from "node:assert/strict";
import test from "node:test";
import { handheldFilters, shakeScale } from "./handheld";

test("handheld shake is deterministic per shot and ends at the output size", () => {
  const a = handheldFilters("086c58b9", 0.3);
  assert.deepEqual(a, handheldFilters("086c58b9", 0.3));
  assert.notDeepEqual(a, handheldFilters("e00f11c5", 0.3));
  assert.match(a.at(-1)!, /^crop=1080:1920:/);
  assert.equal(a[0], "scale=1102:1958");
  assert.ok(!a.join("").includes(","), "no commas inside expressions (filters are joined with commas)");
});

test("light / moderate / strong scale", () => {
  assert.deepEqual([0.3, 0.5, 0.9].map(shakeScale), [0.33, 0.6, 1]);
});
