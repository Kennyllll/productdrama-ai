import { test } from "node:test";
import assert from "node:assert/strict";
import type { ShortShot } from "@/lib/shorts";
import { basisOf, shotChecks } from "@/lib/shorts-sync";
import { autoLayout } from "@/lib/shorts-set";

const shot = (description: string, theme: string) =>
  ({ description, camera: "", productNote: "", framePrompt: "", motionPrompt: "", operator: "", layout: null, scene: { id: "s", v: 1, theme } }) as unknown as ShortShot;

test("还没摆 3D 也查节日：无节日的视频写了圣诞树要报", () => {
  const s = shot("爸爸拿着手机，圣诞树下有一辆三轮车", "none");
  assert.deepEqual(shotChecks(s, basisOf(s, null)), ["节日是「无节日」，文字或字幕里还写着圣诞：删掉这几个词"]);
});

test("字幕里写 Santa 也算节日", () => {
  const s = { ...shot("客厅里有一辆三轮车", "none"), caption: "POV: Santa dropped this off early" } as ShortShot;
  assert.deepEqual(shotChecks(s, basisOf(s, null)), ["节日是「无节日」，文字或字幕里还写着圣诞：删掉这几个词"]);
});

test("自动摆位按拍摄者姿势定机位高度", () => {
  assert.equal(autoLayout({ camera: "", description: "客厅", operator: "" }, 0).camPos[2], 1.5);
  assert.equal(autoLayout({ camera: "", description: "客厅", operator: "crouch" }, 0).camPos[2], 0.75);
});

test("还没摆 3D：节日对得上不报", () => {
  const s = shot("Christmas morning, a tricycle under the tree", "christmas");
  assert.deepEqual(shotChecks(s, basisOf(s, null)), []);
});

test("节日是生日、文字写圣诞：报写错，并按视频的节日查（不按场地旧版本）", () => {
  const s = shot("Santa leaves a scooter under the tree", "none");
  const got = shotChecks(s, basisOf(s, { name: "客厅", outdoor: false, theme: "birthday" }));
  assert.ok(got.some((x) => x.includes("写的却是圣诞：换成生日")), got.join(" | "));
  assert.ok(got.some((x) => x.includes("都没提到")), got.join(" | "));
});
