import { test } from "node:test";
import assert from "node:assert/strict";
import type { SetLayout } from "@/lib/production-repo";
import { FIGURE_POSES, KB002_RIG, rideOf, type FigureSpec, type P3 } from "@/lib/figures";
import { blockingText } from "@/lib/shorts-blocking";
import { promptConflicts } from "@/lib/shorts-conflicts";

const r = rideOf(KB002_RIG);
const lay = (figures: FigureSpec[]): SetLayout => ({ lens: 26, camPos: [0, -3, 1.2], lookAt: [0, 0, 0.4], bike: [0, 0], bikeYaw: 0, aspect: 9 / 16, source: "test", figures });
const fig = (o: Partial<FigureSpec> = {}): FigureSpec => ({ id: "f1", kind: "child", pose: "stand", onProduct: false, dx: -0.2, dy: 0, yaw: 180, ...o });
// yaw 180 时人偶本地坐标 = three.js 坐标 - 人偶位置；车把握把在 (∓gripX, gripY, seatBack - gripZ)
const grip = (sx: number): P3 => [sx * r.gripX + 0.2, r.gripY, KB002_RIG.seatBack - r.gripZ];
const onGrips = { handL: grip(-1), handR: grip(1) };
const person = (l: SetLayout) => blockingText(l, KB002_RIG).split("Person 1: ")[1] ?? "";
const shot = (l: SetLayout, framePrompt = "", motionPrompt = "") => ({ layout: l, description: "", framePrompt, motionPrompt });

test("每种姿态 × 在不在产品上 × 远近：都写明和地面 / 产品的关系", () => {
  for (const { id: pose } of FIGURE_POSES)
    for (const onProduct of [true, false])
      for (const dx of [-0.2, -1.5]) {
        const t = person(lay([fig({ pose, onProduct, dx })]));
        const tag = `${pose} onProduct=${onProduct} dx=${dx}: ${t}`;
        if (onProduct) {
          assert.match(t, /sitting on the product's seat/, tag);
          assert.doesNotMatch(t, /standing with|crouching with|straddling/, tag);
        } else {
          assert.match(t, /(standing|crouching) with|sitting on the ground/, tag);
          assert.doesNotMatch(t, /riding it|sitting on the product's seat/, tag);
          if (Math.abs(dx) < 0.8) assert.match(t, /not sitting on, riding or straddling it/, tag);
          else assert.doesNotMatch(t, /straddling/, tag);
        }
        assert.match(t, /m from the camera/, tag);
      }
});

test("站在车旁、双手在车把上：站地上、手在车把、不跨", () => {
  const t = person(lay([fig({ custom: onGrips, action: "双手扶车把", actionEn: "holding the handlebars with both hands" })]));
  assert.match(t, /standing with both feet on the ground/);
  assert.match(t, /both hands on the product's handlebar grips/);
  assert.match(t, /not sitting on, riding or straddling it/);
  assert.doesNotMatch(t, /hands not touching/);
});

test("手没碰车：写明不碰；抬一只脚、坐地上各自写对", () => {
  assert.doesNotMatch(person(lay([fig()])), /hands not touching|seat|grip/);
  assert.match(person(lay([fig({ custom: { handL: [0.3, 1.2, 0.1], handR: [-0.3, 1.2, 0.1] } })])), /hands not touching it/);
  assert.doesNotMatch(person(lay([fig()])), /standing, standing/);
  assert.match(person(lay([fig({ custom: { footL: [0.05, 0.3, 0.1] } })])), /one foot lifted off the ground/);
  const sit = person(lay([fig({ pose: "sit" })]));
  assert.match(sit, /sitting on the ground/);
  assert.doesNotMatch(sit, /feet/);
});

test("自查：文字写骑车但 3D 没人在车上", () => {
  const l = lay([fig({ custom: onGrips, action: "双手扶车把" })]);
  assert.ok(promptConflicts(shot(l, "The child rides the balance bike."), KB002_RIG).some((c) => c.msg.includes("骑车")));
  assert.deepEqual(promptConflicts(shot(l, "The child is not riding the bike."), KB002_RIG), []);
  assert.deepEqual(promptConflicts(shot(l, "", "孩子推着车往前走"), KB002_RIG), []);
});

test("自查：动作栏和 3D 手的位置对不上", () => {
  assert.ok(promptConflicts(shot(lay([fig({ action: "双手扶车把" })])), KB002_RIG).some((c) => c.msg.includes("手没碰到车把")));
  assert.ok(promptConflicts(shot(lay([fig({ custom: onGrips, action: "站在旁边看镜头" })])), KB002_RIG).some((c) => c.msg.includes("动作栏没写")));
  assert.deepEqual(promptConflicts(shot(lay([fig({ custom: onGrips, action: "站在车旁，不骑车，双手扶车把" })])), KB002_RIG), []);
  assert.ok(promptConflicts(shot(lay([fig({ action: "骑在车上" })])), KB002_RIG).some((c) => c.msg.includes("没在产品上")));
});

test("骑车：三轮车写双脚踩脚踏、平衡车写踩地；人跟车头朝向", () => {
  const rider = fig({ pose: "ride", onProduct: true });
  const trike = { ...KB002_RIG, footY: 0.12 };
  const away = blockingText(lay([rider]), trike).split("Person 1: ")[1] ?? "";
  assert.match(away, /both feet on the pedals/);
  assert.doesNotMatch(away, /feet on the ground/);
  assert.match(away, /with their back to the camera/);
  assert.match(person(lay([rider])), /feet on the ground/);
  const toward = blockingText({ ...lay([rider]), bikeYaw: 180 }, trike).split("Person 1: ")[1] ?? "";
  assert.match(toward, /facing the camera/);
  const acted = blockingText(lay([{ ...rider, actionEn: "waving" }]), trike).split("Person 1: ")[1] ?? "";
  assert.match(acted, /seat with both feet on the pedals, one up and forward, one down and back, waving/);
});
