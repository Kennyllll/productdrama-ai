import { test } from "node:test";
import assert from "node:assert/strict";
import type { ShortShot } from "@/lib/shorts";
import { basisOf, shotChecks } from "@/lib/shorts-sync";

const shot = (description: string, theme: string) =>
  ({ description, camera: "", productNote: "", framePrompt: "", motionPrompt: "", operator: "", layout: null, scene: { id: "s", v: 1, theme } }) as unknown as ShortShot;

test("还没摆 3D 也查节日：无节日的视频写了圣诞树要报", () => {
  const s = shot("爸爸拿着手机，圣诞树下有一辆三轮车", "none");
  assert.deepEqual(shotChecks(s, basisOf(s, null)), ["主题是无节日，文字里还写着圣诞"]);
});

test("还没摆 3D：节日对得上不报", () => {
  const s = shot("Christmas morning, a tricycle under the tree", "christmas");
  assert.deepEqual(shotChecks(s, basisOf(s, null)), []);
});
