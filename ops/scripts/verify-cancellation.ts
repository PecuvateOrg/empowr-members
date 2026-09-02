/**
 * verify-cancellation.ts
 *
 * Run:  npm run verify:cancellation     (from src/)
 *
 * The 48-hour cutoff is a boundary the live data cannot exercise. Whether a
 * booking is inside or outside it depends on the clock, so a suite that used
 * `new Date()` would test a different case every run and would pass on a
 * codebase whose comparison was inverted, off by an hour, or reading the
 * wrong field — most of the time.
 *
 * So `evaluateCancellationPolicy` takes an injectable `now` and the cases
 * below pin the boundary itself: 47.9h refused, exactly 48h ALLOWED
 * (Programme Policies v1.2 §5 says "at least 48 hours", so the boundary is
 * inclusive), 48.1h allowed.
 *
 * The non_refundable carve-out is the other half. Roller Quad Camp and the
 * All Ages Roller Disco must be refused at ANY notice, so it is asserted
 * well outside the window where a cutoff-only check would say yes.
 *
 * What this CANNOT catch: an offering carrying the wrong refund_policy in
 * the database. The flags are set through the admin UI and this suite never
 * sees them — that is a live check, not a unit test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateCancellationPolicy } from "@/lib/cancellation";
import { CANCELLATION_CUTOFF_HOURS } from "@/lib/business-rules";

const NOW = new Date("2026-09-10T12:00:00.000Z");

/** A session start `hours` from NOW. */
function startsIn(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

test("the published cutoff is 48 hours", () => {
  // If this ever changes, the live legal text changed with it.
  assert.equal(CANCELLATION_CUTOFF_HOURS, 48);
});

test("exactly at the cutoff is ALLOWED — the policy says 'at least 48 hours'", () => {
  const p = evaluateCancellationPolicy("standard", startsIn(48), NOW);
  assert.equal(p.allowed, true);
});

test("47.9 hours out is refused", () => {
  const p = evaluateCancellationPolicy("standard", startsIn(47.9), NOW);
  assert.equal(p.allowed, false);
  assert.match(
    p.allowed === false ? p.reason : "",
    /at least 48 hours/,
    "the refusal must name the cutoff — it is the member's only cue"
  );
});

test("48.1 hours out is allowed", () => {
  assert.equal(
    evaluateCancellationPolicy("standard", startsIn(48.1), NOW).allowed,
    true
  );
});

test("a session already in the past is refused, not allowed by a sign error", () => {
  const p = evaluateCancellationPolicy("standard", startsIn(-24), NOW);
  assert.equal(p.allowed, false);
});

test("non_refundable is refused even a month out", () => {
  // Roller Quad Camp / All Ages Roller Disco. The carve-out must beat the
  // cutoff, not be reached only when the cutoff already refuses.
  const p = evaluateCancellationPolicy("non_refundable", startsIn(24 * 30), NOW);
  assert.equal(p.allowed, false);
  assert.match(p.allowed === false ? p.reason : "", /non-refundable/);
});

test("non_refundable inside the cutoff reports the non-refundable reason", () => {
  // Order matters: telling someone "cancel earlier next time" about a
  // programme that can never be cancelled is a false promise.
  const p = evaluateCancellationPolicy("non_refundable", startsIn(1), NOW);
  assert.equal(p.allowed, false);
  assert.match(p.allowed === false ? p.reason : "", /non-refundable/);
});

test("hoursUntilStart is reported on both branches", () => {
  const allowed = evaluateCancellationPolicy("standard", startsIn(72), NOW);
  const refused = evaluateCancellationPolicy("standard", startsIn(2), NOW);
  assert.equal(Math.round(allowed.hoursUntilStart), 72);
  assert.equal(Math.round(refused.hoursUntilStart), 2);
});

test("a Date is accepted as well as an ISO string", () => {
  const asDate = new Date(NOW.getTime() + 72 * 60 * 60 * 1000);
  assert.equal(
    evaluateCancellationPolicy("standard", asDate, NOW).allowed,
    true
  );
});
