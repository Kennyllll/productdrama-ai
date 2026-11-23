import assert from "node:assert/strict";
import test from "node:test";
import { needsComposite } from "./shorts";

test("composite note: 'none' answers do not blank the product graphics", () => {
  assert.equal(needsComposite(""), false);
  assert.equal(needsComposite("无（logo是印在车上的，如果AI画不准，需后期用真实素材合成logo）"), false);
  assert.equal(needsComposite("None"), false);
  assert.equal(needsComposite("投影仪画面后期合成"), true);
});
