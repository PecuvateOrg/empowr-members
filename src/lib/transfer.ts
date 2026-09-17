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
