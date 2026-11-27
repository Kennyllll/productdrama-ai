import { filmerId, filmerScale } from "@/lib/families";
import { operatorPrompt } from "@/lib/shorts-operator";
import { stripFilmer } from "@/lib/shorts-sync";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFamily, DAILY, memberKind, memberText, portraitFor, portraitState, PRESET_FAMILIES, WEAR_THEMES, type FamilyMember } from "@/lib/families";
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
    const mid = 0.135 + figureDims("child", h).ankle;
    assert.ok(Math.abs((p.footL[1] + p.footR[1]) / 2 - mid) < 1e-9);
    assert.ok(p.footL[1] - p.footR[1] > 0.1, "两个脚踏一高一低");
    assert.ok(p.footL[2] > p.footR[2], "高的那只脚靠前");
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
  assert.match(memberText(leo, "christmas"), /^Leo, a 3-year-old boy, light brown curly hair, wearing a red sweater with a reindeer pattern and navy pants$/);
  assert.match(memberText(leo, "none"), /wearing a blue long-sleeve tee/);
  assert.equal(cleanFamily({ name: "" }), null);
  assert.equal(cleanFamily({ name: "X", members: [{ id: "BAD ID", name: "a" }] })!.members.length, 0);
});

test("拿手机的人：镜头优先，none = 不指定；提示词写成员，机位按身高缩放", () => {
  assert.equal(filmerId({ filmer: "a" }, {}), "a");
  assert.equal(filmerId({ filmer: "a" }, { filmer: "b" }), "b");
  assert.equal(filmerId({ filmer: "a" }, { filmer: "none" }), undefined);
  assert.equal(filmerId({}, {}), undefined);
  assert.equal(filmerScale(166), 166 / 175);
  assert.equal(filmerScale(undefined), 1);
  assert.match(operatorPrompt("stand", null, "Emily, a 32-year-old woman"), /holding the phone and filming is Emily/);
  assert.doesNotMatch(operatorPrompt("stand", null), /Emily|holding the phone and filming is/);
  assert.match(operatorPrompt("stand", null), /never walk into the frame/);
  assert.match(operatorPrompt("stand+shadow", null), /only shadow from behind the camera/);
});

test("节日衣服每人一套：预置每家每个节日人人不同；旧的整家同款分给没写的人", () => {
  for (const f of PRESET_FAMILIES)
    for (const t of WEAR_THEMES) {
      const ens = f.members.map((m) => m.themeWear[t.id]?.en);
      assert.ok(ens.every(Boolean), `${f.name} ${t.id} 有人没写`);
      assert.equal(new Set(ens).size, ens.length, `${f.name} ${t.id} 有人撞款`);
    }
  const c = cleanFamily({ name: "X", themeWear: { christmas: { zh: "睡衣", en: "pajamas" } }, members: [{ id: "a", name: "A" }, { id: "b", name: "B", themeWear: { christmas: { zh: "毛衣", en: "a sweater" } } }] })!;
  assert.equal(c.members[0].themeWear.christmas.en, "pajamas");
  assert.equal(c.members[1].themeWear.christmas.en, "a sweater");
  assert.equal("themeWear" in c, false);
});

test("定妆照：长相改了作废；节日用自己那张，没有就拿平时那张只认脸", () => {
  const leo: FamilyMember = structuredClone(PRESET_FAMILIES[0].members.find((m) => m.id === "leo")!);
  assert.equal(portraitFor(leo, "christmas"), null);
  leo.portraits = { [DAILY]: { file: "d.png", usd: 0.1, at: "", look: leo.look.en, wear: leo.wear.en } };
  assert.equal(portraitState(leo, leo.portraits[DAILY], DAILY), "ok");
  assert.deepEqual(portraitFor(leo, "christmas"), { p: leo.portraits[DAILY], outfit: false });
  assert.equal(portraitFor(leo, "none")!.outfit, true);
  leo.portraits.christmas = { file: "c.png", usd: 0.1, at: "", look: leo.look.en, wear: leo.themeWear.christmas.en };
  assert.equal(portraitFor(leo, "christmas")!.p.file, "c.png");
  assert.equal(portraitFor(leo, "christmas")!.outfit, true);
  leo.look = { zh: "黑发", en: "black hair" };
  assert.equal(portraitFor(leo, "christmas"), null);
});

test("filmer sentences are not counted as people in 3D", () => {
  assert.doesNotMatch(stripFilmer("Maya 蹲着，爸爸 Marcus 在手机后面拍，画面里看不到他"), /Marcus/);
  assert.doesNotMatch(stripFilmer("Zoe smiles. Marcus's shadow falls on the path."), /Marcus/);
  assert.match(stripFilmer("Maya 蹲着，爸爸 Marcus 在旁边鼓掌"), /Marcus/);
});
