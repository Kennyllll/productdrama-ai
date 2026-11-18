import { test } from "node:test";
import assert from "node:assert/strict";
import { dropCameraMoves } from "./shorts-set";
import { HF_VIDEO_MODEL, shotHasPeople, VIDEO_MODEL, videoModelOf, type ShortShot } from "./shorts";

test("动作文字里的镜头运动删掉，其余保留", () => {
  assert.equal(dropCameraMoves("Slow push-in towards the tricycle, showing the steel frame and EVA wheels, no people."), "showing the steel frame and EVA wheels, no people.");
  assert.equal(dropCameraMoves("Lily pedals forward. The camera slowly orbits around her."), "Lily pedals forward.");
  assert.equal(dropCameraMoves("Mom tilts her head and smiles."), "Mom tilts her head and smiles.");
  assert.equal(dropCameraMoves("Zoom in on the logo."), "");
});

test("画面有人走 Higgsfield，只拍产品走方舟", () => {
  const empty = { hook: undefined, layout: { figures: [] } } as unknown as ShortShot;
  const person = { hook: undefined, layout: { figures: [{ id: "a", kind: "child" }] } } as unknown as ShortShot;
  const car = { hook: { scene: "car", selfie: true }, layout: null } as unknown as ShortShot;
  assert.equal(shotHasPeople(empty), false);
  assert.equal(videoModelOf(empty), VIDEO_MODEL);
  assert.equal(videoModelOf(person), HF_VIDEO_MODEL);
  assert.equal(videoModelOf(car), HF_VIDEO_MODEL);
});
