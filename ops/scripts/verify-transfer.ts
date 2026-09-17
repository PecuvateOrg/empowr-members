/**
 * verify-transfer.ts
 *
 * Run:  npm run verify:transfer      (from src/)
 *
 * Pins `evaluateTransferPolicy` — the gate on moving a booking to another
 * date of the same offering (Programme Policies v1.2 §5).
 *
 * ⚠️ THE TEST THAT EARNS ITS KEEP IS "the transferable flag is what is
 * read". On every one of the 9 live offerings `transferable` and
 * `refund_policy` move together, so a transfer route that mistakenly gated
 * on `refund_policy` — by reusing evaluateCancellationPolicy, the obvious
 * shortcut — would behave correctly against all current data and against
 * any fixture drawn from it. The case below is therefore deliberately one
 * that exists NOWHERE in production: transferable=false on an offering
 * that is nonetheless refundable. Only reading the right column refuses
 * it. Delete that case and this suite stops proving the feature's premise.
 *
 * The 48h boundary is pinned the same way verify-cancellation.ts pins its
 * own: with an injected `now`, because a suite using the wall clock tests
 * a different case every run and would pass on an inverted comparison most
 * of the time.
 *
 * What this CANNOT catch: an offering carrying the wrong `transferable`
 * value in the database, or the RPC's capacity and one-move guards, which
 * are SQL. Those are a live check and an e2e, not a unit test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateTransferPolicy, type TransferSubject } from "@/lib/transfer";
import {
  TRANSFER_CUTOFF_HOURS,
  CANCELLATION_CUTOFF_HOURS,
} from "@/lib/business-rules";

const NOW = new Date("2026-09-10T12:00:00.000Z");

function startsIn(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

/** A movable booking a week out — the baseline every case below varies by
 *  exactly one field, so a refusal can only be attributed to that field. */
function movable(overrides: Partial<TransferSubject> = {}): TransferSubject {
  return {
    transferable: true,
    enrolmentScope: "per_occurrence",
    startsAt: startsIn(168),
    transferredAt: null,
    ...overrides,
  };
}

test("the baseline case is allowed — otherwise every refusal below is vacuous", () => {
  assert.equal(evaluateTransferPolicy(movable(), NOW).allowed, true);
});

test("the transfer cutoff is the published 48 hours, and is the cancellation window", () => {
  // v1.2 §5 states one window for both actions. If these ever differ, the
  // legal text differs with them.
  assert.equal(TRANSFER_CUTOFF_HOURS, 48);
  assert.equal(TRANSFER_CUTOFF_HOURS, CANCELLATION_CUTOFF_HOURS);
});

test("a NON-transferable but REFUNDABLE offering is refused — the flag read is `transferable`", () => {
  // No live offering is transferable=false while refund_policy='standard',
  // so this combination is the only thing that distinguishes reading the
  // transfer flag from reading the refund flag. See the header.
  const p = evaluateTransferPolicy(
    movable({ transferable: false }),
    NOW
  );
  assert.equal(
    p.allowed,
    false,
    "gating on refund_policy instead of transferable would allow this"
  );
});

test("a course run is refused even when flagged transferable", () => {
  // The admin form defaults new offerings to transferable=true, so a course
  // can carry the flag; scope is what forbids the move, not the flag.
  const p = evaluateTransferPolicy(
    movable({ enrolmentScope: "per_run" }),
    NOW
  );
  assert.equal(p.allowed, false);
  assert.match(p.allowed === false ? p.reason : "", /block/i);
});

test("a booking that has already moved is refused — one move per booking", () => {
  const p = evaluateTransferPolicy(
    movable({ transferredAt: "2026-09-01T09:00:00.000Z" }),
    NOW
  );
  assert.equal(p.allowed, false);
  assert.match(p.allowed === false ? p.reason : "", /already been moved/i);
});

test("exactly at the cutoff is ALLOWED — 'at least 48 hours'", () => {
  assert.equal(evaluateTransferPolicy(movable({ startsAt: startsIn(48) }), NOW).allowed, true);
});

test("47.9 hours out is refused, and the refusal names the cutoff", () => {
  const p = evaluateTransferPolicy(movable({ startsAt: startsIn(47.9) }), NOW);
  assert.equal(p.allowed, false);
  assert.match(
    p.allowed === false ? p.reason : "",
    /at least 48 hours/,
    "the refusal must name the cutoff — it is the member's only cue"
  );
});

test("48.1 hours out is allowed", () => {
  assert.equal(evaluateTransferPolicy(movable({ startsAt: startsIn(48.1) }), NOW).allowed, true);
});

test("a session already in the past is refused, not allowed by a sign error", () => {
  assert.equal(evaluateTransferPolicy(movable({ startsAt: startsIn(-24) }), NOW).allowed, false);
});

test("the non-transferable refusal wins over the cutoff refusal", () => {
  // Ordering matters for the message: a member holding a Roller Disco place
  // must be told it cannot be moved at all, not that they were too late.
  const p = evaluateTransferPolicy(
    movable({ transferable: false, startsAt: startsIn(2) }),
    NOW
  );
  assert.equal(p.allowed, false);
  assert.match(p.allowed === false ? p.reason : "", /can't be moved/i);
});
