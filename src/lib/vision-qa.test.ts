import { test } from "node:test";
import assert from "node:assert/strict";
import { frameProductIssues } from "./vision-qa";

const bad = (part: string, note = "") => ({ part, visible: "clear", same: "no", note });

test("rule #1 product issues need a majority of looks", () => {
  const runs = [[bad("seat backrest", "靠背没有孔")], [bad("Seat backrest ", "靠背是实心的")], [bad("handlebar stem", "立管是直的")]];
  assert.deepEqual(frameProductIssues(runs), ["靠背没有孔"]);
});

test("hidden, unclear or unsure parts never fail rule #1", () => {
  const runs = [0, 1, 2].map(() => [
    { part: "seat backrest", visible: "partly", same: "no", note: "看不到孔" },
    { part: "pedals and cranks", visible: "clear", same: "unsure", note: "" },
    { part: "wheels", visible: "clear", same: "yes", note: "" },
  ]);
  assert.deepEqual(frameProductIssues(runs), []);
});

test("one look counts once per part and falls back to the part name", () => {
  assert.deepEqual(frameProductIssues([[bad("logo"), bad("logo")], [bad("logo")], []]), ["logo和实物不一样"]);
  assert.deepEqual(frameProductIssues([[bad("logo")], "junk", null]), []);
});
