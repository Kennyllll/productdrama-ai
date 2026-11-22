import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAgeRange, formatAge, parseAge } from "@/lib/age-range";

test("适用年龄：最小不大于最大，无效值报错", () => {
  assert.deepEqual(checkAgeRange("3", "6", "岁"), { range: { min: 3, max: 6, unit: "岁" } });
  assert.deepEqual(checkAgeRange("", "", "岁"), { range: null });
  assert.ok("error" in checkAgeRange("6", "3", "岁"));
  assert.ok("error" in checkAgeRange("3", "", "岁"));
  assert.ok("error" in checkAgeRange("-1", "3", "岁"));
  assert.ok("error" in checkAgeRange("abc", "3", "岁"));
  assert.ok("error" in checkAgeRange("1", "3", "年"));
  assert.ok("error" in checkAgeRange("0", "0", "月"));
  assert.ok("error" in checkAgeRange("1", "30", "岁"));
  assert.ok("range" in checkAgeRange("18", "48", "月"));
});

test("旧数据能认就认，认不出返回 null", () => {
  assert.deepEqual(parseAge("3–6 岁"), { min: 3, max: 6, unit: "岁" });
  assert.deepEqual(parseAge("18-36 months"), { min: 18, max: 36, unit: "月" });
  assert.deepEqual(parseAge("2 to 5 years"), { min: 2, max: 5, unit: "岁" });
  assert.equal(parseAge("需用户提供"), null);
  assert.equal(parseAge("6-3 岁"), null);
  assert.equal(formatAge({ min: 1.5, max: 4, unit: "岁" }), "1.5–4 岁");
});
