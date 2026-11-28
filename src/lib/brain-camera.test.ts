import { test } from "node:test";
import assert from "node:assert/strict";
import type { SceneItem } from "@/lib/shorts-scenes";
import { camProblems, checkCam, productPts, project, type CamScene } from "@/lib/brain-camera";

const item = (o: Partial<SceneItem>): SceneItem => ({ id: "i", type: "box", x: 0, y: 0, z: 0, yaw: 0, w: 1, d: 1, h: 1, rgb: [0.5, 0.5, 0.5], ...o });
const room = [
  item({ id: "f", type: "floor", w: 4, d: 4, h: 0.02 }),
  item({ id: "n", type: "wall", y: 2.05, w: 4.2, d: 0.1, h: 2.6 }),
  item({ id: "s", type: "wall", y: -2.05, w: 4.2, d: 0.1, h: 2.6 }),
  item({ id: "e", type: "wall", x: 2.05, w: 0.1, d: 4.2, h: 2.6 }),
  item({ id: "w", type: "wall", x: -2.05, w: 0.1, d: 4.2, h: 2.6 }),
];
const scene = (o: Partial<CamScene> = {}): CamScene => ({ bike: [0, 0], bikeYaw: 0, len: 0.8, h: 0.6, items: room, people: [], ...o });
const inside = (s: CamScene, c: NonNullable<ReturnType<typeof checkCam>["cam"]>) =>
  productPts(s).every((p) => {
    const q = project(c, p);
    return q && Math.abs(q[0]) <= 1 && Math.abs(q[1]) <= 1;
  });

test("机位投影：正前方在画面中心，东边的点在画面右边", () => {
  const c = { camPos: [0, -2, 1] as [number, number, number], lookAt: [0, 0, 1] as [number, number, number], lens: 28 };
  assert.deepEqual(project(c, [0, 0, 1])?.map((x) => Math.round(x * 100) / 100), [0, 0]);
  assert.ok((project(c, [0.5, 0, 1])?.[0] ?? 0) > 0);
  assert.equal(project(c, [0, -3, 1]), null);
});

test("大脑机位太近、产品被裁：程序自动往后拉到拍全", () => {
  const s = scene();
  const r = checkCam({ camPos: [0, -0.3, 0.8], lookAt: [0, 0, 0.3], lens: 50 }, s);
  assert.ok(r.cam);
  assert.ok(inside(s, r.cam!));
  assert.ok(r.fixes.some((f) => /往后拉/.test(f)));
});

test("大脑机位在墙外：挪回屋里", () => {
  const r = checkCam({ camPos: [0, -3, 1], lookAt: [0, 0, 0.3], lens: 24 }, scene());
  assert.ok(r.cam);
  assert.ok(r.cam!.camPos[1] > -2);
  assert.ok(r.fixes.some((f) => /墙外/.test(f)));
});

test("大脑机位穿进家具：不采用，写明原因", () => {
  const s = scene({ items: [...room, item({ id: "sofa", type: "sofa", x: 0, y: -1.5, w: 1.2, d: 0.8, h: 0.9 })] });
  const r = checkCam({ camPos: [0, -1.5, 0.5], lookAt: [0, 0, 0.3], lens: 24 }, s);
  assert.equal(r.cam, null);
  assert.ok(r.errors.length > 0);
});

test("焦段和高度超出范围：改成最接近的", () => {
  const r = checkCam({ camPos: [0, -1.6, 3], lookAt: [0, 0, 0.3], lens: 40 }, scene());
  assert.equal(r.cam?.lens, 35);
  assert.equal(r.cam?.camPos[2], 2.2);
});

test("3D 页机位检查：裁掉、太小、人挡住都报出来，并带写好的要求", () => {
  const s = scene({ people: [{ name: "Marcus", x: 0, y: -0.8, h: 1.8 }] });
  const msgs = (c: Parameters<typeof camProblems>[0], sc = s) => camProblems(c, sc).map((p) => p.msg);
  assert.ok(msgs({ camPos: [0, -0.7, 0.8], lookAt: [0, 0, 0.3], lens: 85 }, scene()).includes("产品被画面裁掉了"));
  assert.ok(msgs({ camPos: [0, -1.9, 1.3], lookAt: [0, 0, 0.3], lens: 18 }, scene()).includes("产品在画面里太小"));
  assert.ok(msgs({ camPos: [0, -1.9, 1.2], lookAt: [0, 0, 0.3], lens: 28 }).includes("Marcus 挡在镜头和产品中间"));
  assert.deepEqual(msgs({ camPos: [-1.1, -0.8, 1.0], lookAt: [0, 0, 0.3], lens: 35 }), []);
  assert.ok(camProblems({ camPos: [0, -2.5, 1.2], lookAt: [0, 0, 0.3], lens: 28 }, scene())[0].ask.includes("挪回屋里"));
});
