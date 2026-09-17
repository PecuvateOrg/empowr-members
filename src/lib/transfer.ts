// Self-serve booking transfer — moving a confirmed booking to another date
// of the SAME offering. Built 2026-09-17 for Programme Policies v1.2 §5,
// which has promised a one-time date move since 2026-09-02 while nothing
// implemented it.
//
// Sibling of lib/cancellation.ts and deliberately NOT folded into it.
// evaluateCancellationPolicy reads `refund_policy` and never sees
// `transferable` — reusing it here would have gated the move on the wrong
// column and still passed every test, because on all 9 live offerings the
// two flags happen to move together. This function reads the flag the
// feature is named after.
//
// Four refusals, in the order a member most needs to hear them:
//   1. the offering is not transferable at all (Camp, Roller Disco)
//   2. it is a course, sold as one block  (decision #4)
//   3. it has already been moved once     (decision #5)
//   4. it is inside the 48h window        (decision #2)
//
// No money moves: a transfer is same-offering, so the price is identical
// and there is no delta to charge or refund. That is the whole reason
// decision #3 restricts it to the same offering.
//
// Pure, with an injectable `now`, so the page (render-time estimate) and
// the API route (authoritative check) share one source of truth and
// ops/scripts/verify-transfer.ts can pin the boundary outside Next.
import { TRANSFER_CUTOFF_HOURS } from "@/lib/business-rules";

export type TransferPolicy =
  | { allowed: true; hoursUntilStart: number }
  | { allowed: false; reason: string; hoursUntilStart: number };

export type TransferSubject = {
  /** mem_offerings.transferable — the per-offering carve-out. */
  transferable: boolean;
  /** Only per_occurrence bookings can be moved a date at a time. */
  enrolmentScope: "per_occurrence" | "per_run";
  /** Start of the date currently booked. */
  startsAt: string | Date;
  /** mem_bookings.transferred_at — non-null means it has had its one move. */
  transferredAt: string | Date | null;
};

export function evaluateTransferPolicy(
  subject: TransferSubject,
  now: Date = new Date()
): TransferPolicy {
  const hoursUntilStart =
    (new Date(subject.startsAt).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (!subject.transferable) {
    return {
      allowed: false,
      reason: "This session can't be moved to another date.",
      hoursUntilStart,
    };
  }
  if (subject.enrolmentScope !== "per_occurrence") {
    return {
      allowed: false,
      reason:
        "Courses are booked as a whole block, so individual dates can't be moved.",
      hoursUntilStart,
    };
  }
  if (subject.transferredAt !== null) {
    return {
      allowed: false,
      reason:
        "This booking has already been moved once. Please email enquiries@empowrcic.org if you need to change it again.",
      hoursUntilStart,
    };
  }
  if (hoursUntilStart < TRANSFER_CUTOFF_HOURS) {
    return {
      allowed: false,
      reason: `Bookings must be moved at least ${TRANSFER_CUTOFF_HOURS} hours before the session.`,
      hoursUntilStart,
    };
  }
  return { allowed: true, hoursUntilStart };
}

/**
 * Can a booking be moved ONTO this date?
 *
 * The cutoff applies to BOTH ends of a move, and this is the second end.
 * evaluateTransferPolicy above judges the session being left; this judges the
 * one being joined.
 *
 * ⚠️ WHY THE TARGET IS GATED AT ALL. The first cut accepted any target that
 * had merely not started yet, which let a member 7 days clear of their booking
 * move onto a session starting in 8 hours. The moment that landed they could
 * neither cancel it (inside the window) nor move it again (one move, spent) —
 * so a single click silently turned a refundable booking into a
 * non-refundable, non-movable one. Cancelling for a refund and re-booking
 * would have left them strictly better off. Gating both ends means a transfer
 * can never commit someone to anything inside the cutoff, which is the promise
 * cancellation already makes.
 *
 * `>=` because the policy says "at least" — exactly at the boundary is
 * allowed, matching evaluateTransferPolicy and the SQL in
 * mem_transfer_booking().
 */
export function isTransferTargetEligible(
  startsAt: string | Date,
  now: Date = new Date()
): boolean {
  const hoursUntilStart =
    (new Date(startsAt).getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntilStart >= TRANSFER_CUTOFF_HOURS;
}
