import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorPos } from "./NearToast";

test("anchorPos：提示贴在按钮下面，不超出右边", () => {
  assert.deepEqual(anchorPos({ top: 100, bottom: 130, left: 50, width: 80 }, 1200, 800), { top: 136, left: 50 });
  assert.deepEqual(anchorPos({ top: 100, bottom: 130, left: 1150, width: 40 }, 1200, 800), { top: 136, left: 832 });
});

test("anchorPos：按钮不见了 / 滚出屏幕 → null（回落到屏幕底部）", () => {
  assert.equal(anchorPos(null, 1200, 800), null);
  assert.equal(anchorPos({ top: 0, bottom: 0, left: 0, width: 0 }, 1200, 800), null);
  assert.equal(anchorPos({ top: -200, bottom: -170, left: 10, width: 50 }, 1200, 800), null);
  assert.equal(anchorPos({ top: 900, bottom: 930, left: 10, width: 50 }, 1200, 800), null);
});
