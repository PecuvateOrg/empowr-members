// Pins creditToApply() to mem_reserve_credit()'s rule: the database refuses a
// basket whose expected credit differs, so any drift breaks credit checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { creditToApply } from "../../src/lib/credit-quote.ts";

test("credit covers the whole basket", () => assert.equal(creditToApply(1000, 5000), 1000));
test("credit covers part; the rest goes on the card", () => assert.equal(creditToApply(1000, 400), 400));
test("no credit", () => assert.equal(creditToApply(1000, 0), 0));
test("a remainder under 30p is raised to 30p for Stripe", () => assert.equal(creditToApply(1000, 990), 970));
test("exactly 30p left is allowed", () => assert.equal(creditToApply(1000, 970), 970));
test("a basket under 30p with partial credit applies none", () => assert.equal(creditToApply(20, 10), 0));
