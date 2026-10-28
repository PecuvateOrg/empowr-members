import { test } from "node:test";
import assert from "node:assert/strict";
import { discountSchema, discountForPlace } from "../../src/lib/discounts.ts";

test("percentage applies globally or only to the selected offering", () => {
  assert.equal(discountForPlace(1000, "a", { kind: "percentage", value: 20, offering_id: null }), 200);
  assert.equal(discountForPlace(1000, "a", { kind: "percentage", value: 20, offering_id: "b" }), 0);
  assert.equal(discountForPlace(1000, "b", { kind: "percentage", value: 20, offering_id: "b" }), 200);
});
test("fixed discounts cannot exceed the price and percentages round per place", () => {
  assert.equal(discountForPlace(100, "a", { kind: "fixed", value: 500, offering_id: null }), 100);
  assert.equal(discountForPlace(105, "a", { kind: "percentage", value: 10, offering_id: null }), 11);
});
test("schema normalises codes and rejects invalid values and expired dates", () => {
  const valid = { code: " summer20 ", kind: "percentage", value: 20, offering_id: null, expires_at: null };
  assert.equal(discountSchema.parse(valid).code, "SUMMER20");
  for (const invalid of [{ value: 101 }, { value: -1 }, { value: 0 }, { value: 0.5 }, { code: "bad code" }, { expires_at: "2000-01-01T00:00:00Z" }, { offering_id: "invalid" }]) {
    assert.equal(discountSchema.safeParse({ ...valid, ...invalid }).success, false);
  }
});
