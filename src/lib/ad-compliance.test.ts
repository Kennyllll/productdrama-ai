import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAdText, EMPTY_FACTS, factsErrors, parseMoney, type AdFacts } from "@/lib/ad-compliance";

const facts = (x: Partial<AdFacts>): AdFacts => ({ ...EMPTY_FACTS, ...x });
const ok = facts({ price: "59.99", priceSource: "amazon 截图 11-20", was: "89.99", wasSource: "10 月售价截图", stock: "50", stockSource: "后台截图", rating: "4.8", ratingSource: "店铺截图", reviews: "1200", reviewsSource: "店铺截图" });

test("金额解析", () => {
  assert.equal(parseMoney("$59.99"), 59.99);
  assert.equal(parseMoney("USD 59"), 59);
  assert.equal(parseMoney("59,99"), 59.99);
  assert.equal(parseMoney("1,299.00"), 1299);
  assert.equal(parseMoney("便宜"), null);
  assert.equal(parseMoney("0"), null);
});

test("依据：有数字没出处、原价不高于现价都拦下", () => {
  assert.deepEqual(factsErrors(ok), {});
  assert.ok(factsErrors(facts({ price: "59.99" })).priceSource);
  assert.match(factsErrors(facts({ price: "59.99", priceSource: "x", was: "59.99", wasSource: "x" })).was ?? "", /不高于现价/);
  assert.match(factsErrors(facts({ price: "59.99", priceSource: "x", was: "49", wasSource: "x" })).was ?? "", /不高于现价/);
  assert.ok(factsErrors(facts({ was: "89", wasSource: "x" })).was);
  assert.ok(factsErrors(facts({ rating: "很好", ratingSource: "x" })).rating);
  assert.ok(factsErrors(facts({ reviews: "很多", reviewsSource: "x" })).reviews);
});

test("字幕里的价格要和登记的一致，没登记就拦", () => {
  const t = [{ where: "开头 字幕", text: "Only $59.99 (was $89.99)" }];
  assert.deepEqual(checkAdText(t, ok).filter((i) => i.level === "block"), []);
  const none = checkAdText(t, EMPTY_FACTS).filter((i) => i.level === "block");
  assert.equal(none.length, 2);
  assert.match(none[1].why, /原价/);
  const wrong = checkAdText([{ where: "x", text: "Just $49.99" }], ok).filter((i) => i.level === "block");
  assert.match(wrong[0].why, /不一致/);
  const noSrc = checkAdText(t, facts({ price: "59.99", was: "89.99" })).filter((i) => i.level === "block");
  assert.equal(noSrc.length, 2);
});

test("库存 / 评分 / 评论数没依据就拦", () => {
  const t = [
    { where: "a", text: "Only 50 left!" },
    { where: "b", text: "4.8 stars from parents" },
    { where: "c", text: "10,000+ parents love it" },
  ];
  assert.equal(checkAdText(t, EMPTY_FACTS).filter((i) => i.level === "block").length, 3);
  assert.equal(checkAdText(t, ok).filter((i) => i.level === "block").length, 0);
});

test("绝对化用语和儿童安全说法：警告并说明原因", () => {
  const w = checkAdText([{ where: "a", text: "The best and safest trike, guaranteed! #1 pick" }], ok);
  assert.ok(w.every((i) => i.level === "warn"));
  const hits = w.map((i) => i.hit.toLowerCase());
  assert.ok(hits.includes("best"));
  assert.ok(hits.some((h) => h.startsWith("#")));
  assert.ok(hits.includes("guaranteed"));
  assert.ok(hits.includes("safest"));
  assert.ok(w.every((i) => i.why.length > 10));
  assert.equal(checkAdText([{ where: "a", text: "Folds in 3 seconds" }], ok).length, 0);
  assert.equal(checkAdText([{ where: "a", text: "Meet her new best friend" }], ok).length, 0);
  assert.equal(checkAdText([{ where: "a", text: "最好的三轮车" }], ok).length, 1);
});
