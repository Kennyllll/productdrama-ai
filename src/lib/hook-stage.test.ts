import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHookLayout, cleanHookPeople, DEFAULT_STAGE } from "./hook-stage";
import type { FamilyMember } from "./families";

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
