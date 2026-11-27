import { test } from "node:test";
import assert from "node:assert/strict";
import { clampReach } from "@/components/shorts/scene-mesh";
import { figureDims } from "@/lib/figures";
import { autoLayout } from "@/lib/shorts-set";

test("手的蓝球拖太远：拉回到手臂伸直能够到的地方", () => {
  const far = clampReach("adult", "stand", {}, "handL", [3, 1.4, 0]);
  const d = figureDims("adult");
  assert.ok(far[0] < 0.2 + d.ua + d.fa + 0.01, `x=${far[0]}`);
  const near: [number, number, number] = [0.25, 1.1, 0.2];
  assert.deepEqual(clampReach("adult", "stand", {}, "handL", near), near);
});

test("全景自动摆位：相机留在 ±3 米的房间里", () => {
  for (let i = 0; i < 8; i++) {
    const l = autoLayout({ camera: "全景", description: "" }, i);
    assert.ok(Math.abs(l.camPos[0]) < 2.9 && Math.abs(l.camPos[1]) < 2.9, JSON.stringify(l.camPos));
  }
});
