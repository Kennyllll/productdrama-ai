import { test } from "node:test";
import assert from "node:assert/strict";
import { KB002_RIG, type FigureSpec } from "@/lib/figures";
import type { SceneItem } from "@/lib/shorts-scenes";
import { attachCarried, carryBlock, carryHand, castTextIssues, freeSpot, isStructure, isUpright, itemAt, itemLabel, normalizeStage, relSpot, rideBlock, roomBox, stageRuleIssues, stageTextNotes, wallBetween, type StagePose } from "@/lib/stage-rules";

const fig = (o: Partial<FigureSpec> = {}): FigureSpec => ({ id: "f1", kind: "child", pose: "stand", onProduct: false, dx: 1, dy: 0, yaw: 0, ...o });
const doc = (figures: FigureSpec[], o: Partial<StagePose> = {}): StagePose => ({ figures, bike: [0, 0], bikeYaw: 0, bikeLift: 0, bikePitch: 0, bikeRoll: 0, bikeGround: 0, ...o });
const item = (o: Partial<SceneItem>): SceneItem => ({ id: "i", type: "box", x: 0, y: 0, z: 0, yaw: 0, w: 1, d: 1, h: 1, rgb: [0.5, 0.5, 0.5], ...o });

test("车上已有人：别人的「骑」点不了，并说出是谁", () => {
  const d = doc([fig({ id: "a", onProduct: true, pose: "ride" }), fig({ id: "b" })]);
  assert.match(rideBlock(d, d.figures[1]), /人偶1.*只有 1 个座位/);
  assert.equal(rideBlock(d, d.figures[0]), "");
  assert.match(rideBlock(doc([fig()], { bikeRoll: 90 }), fig()), /不是立着/);
  assert.match(rideBlock({ ...d, bike: undefined }, d.figures[1]), /没有产品/);
});

test("多人骑同一辆车：只留第一个，其余自动下车站到车旁", () => {
  const d = doc([fig({ id: "a", onProduct: true, pose: "ride" }), fig({ id: "b", onProduct: true, pose: "ride" })]);
  const { doc: n, notes } = normalizeStage(d, KB002_RIG);
  assert.equal(n.figures.filter((f) => f.onProduct).length, 1);
  assert.equal(n.figures[0].onProduct, true);
  assert.equal(n.figures[1].pose, "stand");
  assert.ok(Math.hypot(n.figures[1].dx, n.figures[1].dy) >= 0.7);
  assert.match(notes.join(), /人偶2.*已下车/);
});

test("车侧躺 / 竖起 / 提起：骑车的人自动下车", () => {
  for (const o of [{ bikeRoll: 90 }, { bikePitch: 80 }, { bikeLift: 0.45 }]) {
    const d = doc([fig({ onProduct: true, pose: "ride" })], o);
    assert.equal(isUpright(d), false);
    const { doc: n, notes } = normalizeStage(d, KB002_RIG);
    assert.equal(n.figures[0].onProduct, false, JSON.stringify(o));
    assert.match(notes.join(), /车不是立着的/);
  }
  assert.deepEqual(normalizeStage(doc([fig({ onProduct: true, pose: "ride" })]), KB002_RIG).notes, []);
});

test("单手提 / 双手抱：车挂到手上，人不动，车离地", () => {
  for (const pose of ["carry", "hug"] as const)
    for (const yaw of [0, 90, -135]) {
      const d = doc([fig({ pose, dx: 1.2, dy: -0.5, yaw })]);
      const P = [1.2, -0.5];
      const n = attachCarried(d, KB002_RIG);
      const f = n.figures[0];
      assert.ok(Math.abs(n.bike![0] + f.dx - P[0]) < 0.002 && Math.abs(n.bike![1] + f.dy - P[1]) < 0.002, "人原地不动");
      assert.ok(n.bikeLift > 0.02, `${pose} 车离地`);
      // 握点（座位）在手的位置
      const [hx, , hz] = carryHand(f, KB002_RIG);
      const th = Math.PI - (yaw * Math.PI) / 180;
      const hand = [P[0] + hx * Math.cos(th) + hz * Math.sin(th), P[1] - (-hx * Math.sin(th) + hz * Math.cos(th))];
      const phi = ((n.bikeYaw - 90) * Math.PI) / 180;
      const seat = [n.bike![0] + KB002_RIG.seatBack * Math.cos(phi), n.bike![1] + KB002_RIG.seatBack * Math.sin(phi)];
      assert.ok(Math.hypot(hand[0] - seat[0], hand[1] - seat[1]) < 0.005, `${pose} yaw=${yaw}`);
    }
});

test("有人拿车时：别人不能骑，也不能再拿", () => {
  const d = doc([fig({ id: "a", pose: "carry" }), fig({ id: "b" })]);
  assert.match(rideBlock(d, d.figures[1]), /手上/);
  assert.match(carryBlock(d, d.figures[1]), /已经在人偶1·小孩手上/);
  const two = normalizeStage(doc([fig({ id: "a", pose: "carry" }), fig({ id: "b", pose: "hug" })]), KB002_RIG);
  assert.equal(two.doc.figures[1].pose, "stand");
});

test("车悬空没人拿：提醒；有人拿：不提醒", () => {
  assert.match(stageRuleIssues(doc([fig()], { bikeLift: 0.45 })).join(), /悬空 0\.45 米，没有人拿着/);
  const held = attachCarried(doc([fig({ pose: "carry" })]), KB002_RIG);
  assert.doesNotMatch(stageRuleIssues(held).join(), /悬空/);
  assert.match(stageRuleIssues(doc([fig({ memberId: "m1" })]), [], "m1").join(), /拿手机/);
});

test("新人偶：避开家具、在房间里、面向产品", () => {
  const items = [item({ id: "fl", w: 6, d: 6, h: 0.02 }), item({ id: "sofa", type: "sofa", x: 1, y: 0, w: 1.2, d: 1.2, h: 0.8 })];
  const s = freeSpot(doc([]), items, [0, -3]);
  assert.ok(!(Math.abs(s.dx - 1) < 0.85 && Math.abs(s.dy) < 0.85), "不在沙发里");
  // 朝向：yaw 0 = 面朝地图 +y，90 = 面朝 +x；面向产品 = 朝 (-dx, -dy)
  const f = [Math.sin((s.yaw * Math.PI) / 180), Math.cos((s.yaw * Math.PI) / 180)];
  const want = [-s.dx / Math.hypot(s.dx, s.dy), -s.dy / Math.hypot(s.dx, s.dy)];
  assert.ok(Math.hypot(f[0] - want[0], f[1] - want[1]) < 0.01, JSON.stringify(s));
});

test("场地：墙 / 地板锁住；旧版灰盒按尺寸改名", () => {
  const floor = item({ id: "fl", w: 6, d: 5, h: 0.02 });
  const back = item({ id: "bw", y: 2.5, w: 6, d: 0.1, h: 2.6 });
  const left = item({ id: "lw", x: -3, w: 0.1, d: 5, h: 2.6 });
  const table = item({ id: "t", w: 1.2, d: 0.6, h: 0.45 });
  const items = [floor, back, left, table];
  assert.deepEqual(items.map(isStructure), [true, true, true, false]);
  assert.deepEqual(items.map((i) => itemLabel(i, items)), ["地板", "后墙（地图上方）", "左墙", "物件1 · 1.2×0.6 米"]);
  assert.equal(itemLabel(item({ type: "sofa" }), items), "沙发");
  assert.deepEqual(roomBox(items), { x0: -3, x1: 3, y0: -2.5, y1: 2.5 });
});

test("文字说明：连续动作只管第一帧，摆不出来的直接说", () => {
  const n = stageTextNotes("小女孩骑着三轮车冲过来，然后妈妈把车折叠放进后备箱");
  assert.deepEqual(n.map((x) => x.key), ["motion", "fold", "trunk"]);
  assert.match(n[0].text, /3D 只管第一帧/);
  assert.equal(stageTextNotes("Mom lifts the trike", doc([fig()])).some((x) => x.key === "carry"), true);
  assert.equal(stageTextNotes("Mom lifts the trike", doc([fig({ pose: "carry" })])).some((x) => x.key === "carry"), false);
  assert.deepEqual(stageTextNotes("孩子坐在车上笑"), []);
});

test("文字里的人：家里没有 / 3D 里没有都要说", () => {
  const ms = [{ id: "m1", name: "Leo", role: "son" as const, kind: "child" as const }];
  assert.match(castTextIssues("小女孩坐在车上", ms, [fig()]).join(), /没有女孩.*Leo/);
  assert.match(castTextIssues("妈妈在旁边", [{ id: "m2", name: "Amy", role: "mom" as const, kind: "adult" as const }], [fig()]).join(), /没有大人人偶/);
  assert.deepEqual(castTextIssues("小男孩坐在车上", ms, [fig()]), []);
});

test("机位在墙外 / 家具里：能查出来，并给出墙内的位置；敞开的一边不算", () => {
  const items = [item({ id: "fl", w: 6, d: 5, h: 0.02 }), item({ id: "bw", y: 2.5, w: 6, d: 0.1, h: 2.6 }), item({ id: "sofa", type: "sofa", x: 2, y: 1.5, w: 1.8, d: 0.9, h: 0.8 })];
  const out = wallBetween([0, 3.5], 1.2, items);
  assert.equal(out?.wall.id, "bw");
  assert.ok(out!.inside[1] < 2.45 && out!.inside[1] > 2);
  assert.equal(wallBetween([0, -4], 1.2, items), null);
  assert.equal(wallBetween([0, 3.5], 3, items), null, "高过墙顶不算");
  assert.equal(itemAt([2, 1.5], 0.5, items)?.id, "sofa");
  assert.equal(itemAt([2, 1.5], 1.2, items), undefined);
});

test("站在车的左右前后：按车头方向算，面向车", () => {
  const l = relSpot(0, 90, 1);
  assert.deepEqual([l.dx, l.dy], [-1, 0]);
  assert.equal(l.yaw, 90);
  const f = relSpot(90, 0, 1);
  assert.deepEqual([f.dx, f.dy], [-1, 0]);
});
