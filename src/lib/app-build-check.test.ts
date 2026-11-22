import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { needsBuild } from "../../scripts/app-build-check.mjs";

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-app-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "a.ts"), "x");
  return root;
}
const touch = (f: string, t: number) => fs.utimesSync(f, t / 1000, t / 1000);

test("没有打包过：要打包", () => {
  assert.equal(needsBuild(tmpProject(), ".next-app"), true);
});

test("源码比打包旧：跳过；源码改了：重新打包", () => {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, ".next-app"));
  const id = path.join(root, ".next-app", "BUILD_ID");
  fs.writeFileSync(id, "x");
  const now = Date.now();
  touch(path.join(root, "src", "a.ts"), now - 60_000);
  touch(id, now);
  assert.equal(needsBuild(root, ".next-app"), false);
  fs.mkdirSync(path.join(root, "src", "deep"));
  fs.writeFileSync(path.join(root, "src", "deep", "b.tsx"), "y");
  touch(path.join(root, "src", "deep", "b.tsx"), now + 60_000);
  assert.equal(needsBuild(root, ".next-app"), true);
});
