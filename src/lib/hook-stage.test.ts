import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHookLayout, cleanHookPeople, DEFAULT_STAGE } from "./hook-stage";
import type { FamilyMember } from "./families";
import { KB002_RIG } from "./figures";
import { fitFigureActions, promptConflicts } from "./shorts-conflicts";

const m = (id: string, age: number, heightCm: number): FamilyMember => ({ id, name: id, role: age >= 14 ? "dad" : "son", age, heightCm, look: { zh: "", en: "" }, wear: { zh: "", en: "" } }) as FamilyMember;
const fam = [m("ryan", 34, 183), m("leo", 4, 105), m("mia", 3, 98)];

test("Hook 出镜人员：拍摄者和外人去掉、大人不能骑、只能一个人骑、站位不重叠", () => {
  const { people, dropped } = cleanHookPeople(
    [
      { memberId: "ryan", pose: "ride", side: "right" },
      { memberId: "leo", pose: "ride" },
      { memberId: "mia", pose: "ride", side: "right" },
      { memberId: "emily", pose: "stand" },
    ],
    fam,
    undefined,
  );
  assert.equal(people.length, 3);
  assert.deepEqual(people.map((p) => [p.memberId, p.pose, p.onProduct]), [["ryan", "stand", false], ["leo", "ride", true], ["mia", "stand", false]]);
  assert.notEqual(people[0].side, people[2].side);
  assert.equal(people[0].h, 1.83);
  assert.equal(dropped.length, 2);
  assert.equal(cleanHookPeople([{ memberId: "emily" }], fam).people.length, 0);
  const f = cleanHookPeople([{ memberId: "ryan", pose: "stand" }], fam, "ryan");
  assert.equal(f.people.length, 0);
});

test("Hook 3D：人偶带成员和动作", () => {
  const { people } = cleanHookPeople([{ memberId: "leo", pose: "ride", action: "笑着按铃", actionEn: "ringing the bell" }], fam);
  const l = buildHookLayout({ ...DEFAULT_STAGE, people }, null, 0.51);
  assert.equal(l.figures?.[0].memberId, "leo");
  assert.equal(l.figures?.[0].actionEn, "ringing the bell");
  assert.equal(l.figures?.[0].onProduct, true);
});

test("Hook 动作：旁边的人写扶车把，草稿就改成看着；采用时 3D 做不到的动作程序兜底改掉", () => {
  const { people, dropped } = cleanHookPeople(
    [
      { memberId: "leo", pose: "ride", action: "双手握车把，双脚踩脚踏" },
      { memberId: "ryan", pose: "stand", side: "left", action: "一只手扶在车把上", actionEn: "one hand on the handlebar" },
    ],
    fam,
  );
  assert.equal(people[1].action, "站在车旁看着");
  assert.ok(!/handlebar/.test(people[1].actionEn ?? ""));
  assert.equal(dropped.length, 1);
  assert.equal(people[0].action, "双手握车把，双脚踩脚踏");
  const l = buildHookLayout({ ...DEFAULT_STAGE, people }, null, KB002_RIG.gripY);
  l.figures = l.figures?.map((f) => (f.memberId === "ryan" ? { ...f, action: "一只手扶在车把上" } : f));
  assert.ok(promptConflicts({ layout: l, description: "", framePrompt: "", motionPrompt: "" }, KB002_RIG).some((c) => c.fix === "3d"));
  const fixed = fitFigureActions(l, KB002_RIG);
  assert.equal(fixed.length, 1);
  assert.equal(promptConflicts({ layout: l, description: "", framePrompt: "", motionPrompt: "" }, KB002_RIG).filter((c) => c.fix === "3d").length, 0);
});

test("自拍：拿手机的人在产品和摄影机之间，脸朝镜头，摄影机在他面前约半米、手机高度", async () => {
  const { applySelfie, buildHookLayout } = await import("@/lib/hook-stage");
  const base = buildHookLayout({ dist: 1.8, camH: 1.4, lens: 24, view: "front34", people: [] }, null, 0.51);
  const l = applySelfie(base, "front34", 0.51, { kind: "adult", pose: "reach", memberId: "marcus", h: 1.85 });
  const me = l.figures!.find((f) => f.id === "self")!;
  const toCam = Math.hypot(l.camPos[0] - me.dx, l.camPos[1] - me.dy);
  assert.ok(toCam > 0.5 && toCam < 0.7, `离镜头 ${toCam}`);
  assert.ok(Math.hypot(me.dx, me.dy) > 0.4, "产品在他身后");
  assert.ok(Math.abs(l.camPos[2] - 1.85 * 0.88) < 0.02);
  const face = (Math.atan2(l.camPos[0] - me.dx, l.camPos[1] - me.dy) * 180) / Math.PI;
  assert.ok(Math.abs(face - me.yaw) < 1, "脸朝镜头");
  assert.equal(applySelfie(l, "front34", 0.51, { kind: "adult", pose: "reach", memberId: "marcus", h: 1.85 }).figures!.length, 1, "重复开自拍不会多出一个人");
});
