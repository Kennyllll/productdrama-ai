import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FACTS } from "@/lib/ad-compliance";
import { bodyGaps, exportReport, exportTexts, formalExportError } from "@/lib/export-check";
import type { ShortShot } from "@/lib/shorts";

const shot = (x: Partial<ShortShot>) => ({ id: Math.random().toString(36).slice(2), beat: "镜头", caption: "", stage: "accepted", videoJobId: "j1", ...x }) as ShortShot;
const hook = shot({ id: "h1", caption: "Only $59.99 today", hook: { name: "价格开场", values: { price: "$59.99", was: "$89.99" } } });

test("正文没采用的镜头逐个列出", () => {
  const v = { shots: [hook, shot({}), shot({ stage: "video_ready" }), shot({ stage: "draft" }), shot({ videoJobId: null })] };
  const g = bodyGaps(v);
  assert.deepEqual(g.map((x) => x.n), [2, 3, 4]);
  assert.match(g[0].why, /采用/);
  assert.match(g[2].why, /没有视频/);
  assert.match(bodyGaps({ shots: [shot({})] }, () => false)[0].why, /找不到/);
});

test("只有开头时不能正式导出", () => {
  const r = exportReport({ shots: [hook, shot({ stage: "frame_ok" })] }, { ...EMPTY_FACTS, price: "59.99", priceSource: "x" });
  assert.match(formalExportError(r), /正文还有 1 镜没好/);
});

test("Hook 填的值也拿来查：原价没依据要拦", () => {
  const v = { shots: [hook, shot({ caption: "Folds flat" })] };
  const texts = exportTexts(v).map((t) => t.where);
  assert.ok(texts.some((w) => w.includes("「was」")));
  const r = exportReport(v, { ...EMPTY_FACTS, price: "59.99", priceSource: "x" });
  assert.equal(r.gaps.length, 0);
  assert.equal(r.blocks.length, 1);
  assert.match(r.blocks[0].why, /原价/);
  assert.match(formalExportError(r), /没有依据/);
  assert.equal(formalExportError(exportReport(v, { ...EMPTY_FACTS, price: "59.99", priceSource: "x", was: "89.99", wasSource: "y" })), "");
});
