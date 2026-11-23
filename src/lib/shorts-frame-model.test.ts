import assert from "node:assert/strict";
import test from "node:test";
import { FRAME_MODEL, frameModelOf, jobModelOf, SHORT_FRAME_MODEL } from "./shorts";

test("frame model: Seedream by default, Sunburst when the shot picks it", () => {
  const base = { hook: undefined, layout: null };
  assert.equal(jobModelOf("frame", base), SHORT_FRAME_MODEL);
  assert.equal(frameModelOf({}).usd, 0.04);
  assert.equal(jobModelOf("frame", { ...base, frameModel: "sunburst" }), FRAME_MODEL);
  assert.equal(frameModelOf({ frameModel: "sunburst" }).maxRefs, 16);
  assert.equal(jobModelOf("scene", { ...base, frameModel: "seedream" }), FRAME_MODEL);
});
