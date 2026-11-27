import { test } from "node:test";
import assert from "node:assert/strict";
import { familyWord, leftovers, mapCast, swapText } from "./template-retarget";

test("换人名按整词换，长的先换", () => {
  const r = swapText("Leo and the Miller family; Leopard toy", [
    { from: "Leo", to: "Zoe" },
    { from: "Miller", to: "Johnson" },
  ]);
  assert.equal(r.text, "Zoe and the Johnson family; Leopard toy");
  assert.equal(r.n, 2);
  assert.equal(familyWord("Miller 家"), "Miller");
});

test("旧家庭成员按角色配到新家庭，配不上的列出来", () => {
  const old = [
    { slot: 1, id: "a", name: "Emily", role: "mom" as const, child: false, family: "Miller 家" },
    { slot: 1, id: "b", name: "Leo", role: "son" as const, child: true, family: "Miller 家" },
    { slot: 1, id: "c", name: "Ryan", role: "dad" as const, child: false, family: "Miller 家" },
  ];
  const r = mapCast(old, [{ slot: 1, name: "Johnson 家", members: [
    { id: "x", name: "Maya", role: "mom", age: 34 },
    { id: "y", name: "Zoe", role: "daughter", age: 3 },
  ] }]);
  assert.deepEqual(r.swaps, [{ from: "Emily", to: "Maya" }, { from: "Leo", to: "Zoe" }]);
  assert.equal(r.ids.get("b"), "y");
  assert.deepEqual(r.unmatched, ["Ryan"]);
});

test("列出还留着的旧词", () => {
  assert.deepEqual(leftovers([{ label: "#1", text: "a red KIDTRIKE" }, { label: "#2", text: "ok" }], ["KIDTRIKE", "x"]), ["#1：还写着 「KIDTRIKE」"]);
});
