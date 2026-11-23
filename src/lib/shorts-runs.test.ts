import assert from "node:assert/strict";
import test from "node:test";
import { reservedOf, runs, withVideoLock } from "./shorts-runs";

test("approved but not yet created jobs count as held money", () => {
  runs.clear();
  runs.set("v1:a", { kind: "frame", startedAt: 0, step: "prep", usd: 0.1 });
  runs.set("v1:b", { kind: "video", startedAt: 0, step: "gen", jobId: "j", usd: 1 });
  runs.set("v1:c", { kind: "video", startedAt: 0, step: "prep", error: "x", usd: 1 });
  runs.set("v2:a", { kind: "frame", startedAt: 0, step: "prep", usd: 0.1 });
  assert.deepEqual(reservedOf("v1"), [{ shotId: "a", kind: "frame", usd: 0.1 }]);
  runs.clear();
});

test("video lock runs quote + hold one at a time, and survives errors", async () => {
  const order: string[] = [];
  const slow = (tag: string, ms: number) => withVideoLock("v", async () => {
    order.push(`${tag}>`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`<${tag}`);
    return tag;
  });
  const bad = withVideoLock("v", async () => {
    throw new Error("no");
  });
  const [a, , b] = await Promise.allSettled([slow("a", 20), bad, slow("b", 1)]);
  assert.equal(a.status, "fulfilled");
  assert.equal(b.status, "fulfilled");
  assert.deepEqual(order, ["a>", "<a", "b>", "<b"]);
});
