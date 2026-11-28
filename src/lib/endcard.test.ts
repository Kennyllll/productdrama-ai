import { test } from "node:test";
import assert from "node:assert/strict";
import { hasClip, noProductShot } from "@/lib/shorts";
import { missingBody } from "@/lib/spend";
import type { ShortShot } from "@/lib/shorts";

const shot = (p: Partial<ShortShot>) => ({ id: "x", beat: "", stage: "accepted", videoJobId: null, productNote: "", ...p }) as ShortShot;

test("Logo 片尾没有 AI 视频也算有画面，导出不再报缺镜头", () => {
  assert.equal(hasClip(shot({ endCard: true })), true);
  assert.equal(hasClip(shot({})), false);
  assert.deepEqual(missingBody({ shots: [shot({ videoJobId: "v1" }), shot({ endCard: true }), shot({ beat: "结尾" })] }), ["#3 结尾"]);
});

test("分镜写「无产品」才建议改成 Logo 片尾", () => {
  assert.equal(noProductShot({ productNote: "无产品，仅Logo。" }), true);
  assert.equal(noProductShot({ productNote: "产品侧面完整入镜" }), false);
});
