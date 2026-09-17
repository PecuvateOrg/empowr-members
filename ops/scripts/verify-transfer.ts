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

import {
  evaluateTransferPolicy,
  isTransferTargetEligible,
  type TransferSubject,
} from "@/lib/transfer";
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

// ---------------------------------------------------------------------------
// The TARGET end of the move. Added 2026-09-17: the cutoff applies to BOTH
// dates, not just the one being left.
//
// The bug these pin is not a scheduling nicety. Accepting any not-yet-started
// target let a member 7 days clear of their booking move onto a session 8
// hours away — and the instant it landed they could neither cancel it (inside
// the window) nor move it again (one move, spent). One click silently turned a
// refundable booking into a non-refundable, non-movable one.
// ---------------------------------------------------------------------------

test("a target well beyond the cutoff is eligible", () => {
  assert.equal(isTransferTargetEligible(startsIn(168), NOW), true);
});

test("a target 8 hours away is REFUSED — the trap this rule exists to close", () => {
  // The exact case from the live data: a Skate Jam session the same evening,
  // offered while the member's own booking was still a week out.
  assert.equal(
    isTransferTargetEligible(startsIn(8), NOW),
    false,
    "moving here would strip the member's right to cancel, silently"
  );
});

test("the target boundary is inclusive at exactly the cutoff", () => {
  // "at least 48 hours", same reading as the source end — the two must agree
  // or a date is offered by one check and refused by the other.
  assert.equal(isTransferTargetEligible(startsIn(48), NOW), true);
  assert.equal(isTransferTargetEligible(startsIn(47.9), NOW), false);
  assert.equal(isTransferTargetEligible(startsIn(48.1), NOW), true);
});

test("a target in the past is refused, not allowed by a sign error", () => {
  assert.equal(isTransferTargetEligible(startsIn(-24), NOW), false);
});

test("source and target use the SAME boundary", () => {
  // They are separate functions and could drift apart; at the boundary they
  // must give the same verdict, or the picker and the gate contradict.
  for (const hours of [47.9, 48, 48.1, 200]) {
    const sourceAllows = evaluateTransferPolicy(
      movable({ startsAt: startsIn(hours) }),
      NOW
    ).allowed;
    assert.equal(
      isTransferTargetEligible(startsIn(hours), NOW),
      sourceAllows,
      `source and target disagree at ${hours}h`
    );
  }
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
