import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFamily, memberKind, memberText, PRESET_FAMILIES } from "@/lib/families";
import { cleanFigures, figureDims, KB002_RIG, presetPose, rideOf } from "@/lib/figures";

test("人偶按成员身高缩放：站姿髋部跟身高走", () => {
  const short = presetPose("child", "stand", undefined, 0.88);
  const tall = presetPose("child", "stand", undefined, 1.1);
  assert.ok(Math.abs(short.hip[1] / tall.hip[1] - 0.88 / 1.1) < 1e-6);
  assert.equal(figureDims("child").H, 0.95);
  assert.equal(figureDims("adult", 1.62).H, 1.62);
});

test("骑车时不管身高，手都在车把、脚踏高度跟着接触点", () => {
  const rig = rideOf({ ...KB002_RIG, footY: 0.135 });
  for (const h of [0.88, 0.95, 1.1]) {
    const p = presetPose("child", "ride", rig, h);
    assert.deepEqual(p.handL, [rig.gripX, rig.gripY, rig.gripZ]);
    assert.ok(Math.abs(p.footL[1] - (0.135 + figureDims("child", h).ankle)) < 1e-9);
  }
});

test("cleanFigures 保留成员和身高，并限制范围", () => {
  const [f] = cleanFigures([{ id: "f1", kind: "child", pose: "stand", memberId: "leo", h: 5 }])!;
  assert.equal(f.memberId, "leo");
  assert.equal(f.h, 2.1);
});

test("预置 4 家 14 人，成员提示词带名字和节日衣服", () => {
  assert.equal(PRESET_FAMILIES.length, 4);
  assert.equal(PRESET_FAMILIES.reduce((a, f) => a + f.members.length, 0), 14);
  const miller = PRESET_FAMILIES[0];
  const leo = miller.members.find((m) => m.id === "leo")!;
  assert.equal(memberKind(leo), "child");
  assert.match(memberText(miller, leo, "christmas"), /^Leo, a 3-year-old boy, light brown curly hair, wearing matching red plaid Christmas pajamas$/);
  assert.match(memberText(miller, leo, "none"), /wearing a blue long-sleeve tee/);
  assert.equal(cleanFamily({ name: "" }), null);
  assert.equal(cleanFamily({ name: "X", members: [{ id: "BAD ID", name: "a" }] })!.members.length, 0);
});
