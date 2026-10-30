import test from "node:test";
import assert from "node:assert/strict";
import { subscriberCancellationCredit } from "../../src/lib/subscriber-cancellation-credit.ts";
import { cancelOccurrenceSchema } from "../../src/lib/validation.ts";

test("defaults to four sessions even in a five-Monday month", () => {
  const quote = subscriberCancellationCredit(4500, "2026-11-02T16:00:00Z");
  assert.equal(quote.count, 4);
  assert.equal(quote.amountPence, 1125);
  assert.match(quote.explanation, /using 4 sessions for November 2026/);
  assert.match(quote.explanation, /£45.00 divided by 4 gives £11.25/);
  assert.doesNotMatch(quote.explanation, /has 4 Mondays/);
});

test("choosing five credits one fifth of the matching monthly plan price", () => {
  const quote = subscriberCancellationCredit(4500, "2026-11-02T16:00:00Z", 5);
  assert.equal(quote.amountPence, 900);
  assert.match(quote.explanation, /using 5 sessions for November 2026/);
  assert.equal(subscriberCancellationCredit(3000, "2026-11-02T16:00:00Z", 5).amountPence, 600);
});

test("uses the London month at a BST month boundary", () => {
  assert.match(subscriberCancellationCredit(4500, "2026-08-31T23:30:00Z", 4).explanation, /September 2026/);
});

test("rounds fractional pennies", () => {
  assert.equal(subscriberCancellationCredit(3001, "2026-12-07T16:00:00Z", 4).amountPence, 750);
  assert.equal(subscriberCancellationCredit(3002, "2026-12-07T16:00:00Z", 4).amountPence, 751);
});

test("invalid prices, dates and divisors cannot create a credit", () => {
  for (const price of [0, -1, 0.5, NaN, Infinity, 1]) {
    assert.throws(() => subscriberCancellationCredit(price, "2026-11-02T16:00:00Z", 4));
  }
  for (const count of [0, -1, 4.5, 6, NaN, Infinity]) {
    assert.throws(() => subscriberCancellationCredit(4500, "2026-11-02T16:00:00Z", count));
  }
  assert.throws(() => subscriberCancellationCredit(4500, "invalid", 4));
});

test("request schema defaults to four and only accepts numeric four or five", () => {
  assert.equal(cancelOccurrenceSchema.parse({ outcome: "credit", reason: null }).sessions_in_month, 4);
  assert.equal(cancelOccurrenceSchema.parse({ outcome: "credit", reason: null, sessions_in_month: 5 }).sessions_in_month, 5);
  for (const count of [0, -1, 4.5, 6, "5", null]) {
    assert.equal(cancelOccurrenceSchema.safeParse({ outcome: "credit", reason: null, sessions_in_month: count }).success, false);
  }
});
