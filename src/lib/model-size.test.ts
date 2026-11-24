import assert from "node:assert/strict";
import test from "node:test";
import { parseLengthCm } from "./model-size";

test("reads labeled length", () => {
  assert.equal(parseLengthCm("长 67 × 宽 45 × 高 60 cm"), 67);
  assert.equal(parseLengthCm("高60cm，长67.4cm"), 67.4);
});

test("unlabeled takes the largest number and converts units", () => {
  assert.equal(parseLengthCm("670×450×600mm"), 67);
  assert.equal(parseLengthCm("0.67 x 0.45 x 0.6 m"), 67);
  assert.equal(parseLengthCm("67cm"), 67);
});

test("nothing usable", () => {
  assert.equal(parseLengthCm(""), null);
  assert.equal(parseLengthCm("适合 1–3 岁"), null);
});
