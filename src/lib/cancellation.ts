// Self-serve cancellation policy. Restored 2026-09-02 for Programme
// Policies v1.2, which replaced v1.1's "all bookings are final" with a
// member self-serve cancel/transfer window.
//
// Non-refundable offerings are always blocked (Roller Quad Camp and All
// Ages Roller Disco keep that carve-out); everything else is blocked
// inside the cutoff and allowed beyond it.
//
// Members cancel for a refund to the original tender: card payments return
// to the card and credit returns to its original note with its original expiry.
// New discretionary credit notes are issued by staff.
//
// Pure function so the page (render-time estimate) and the API route
// (authoritative check) share one source of truth. No `server-only`, so
// ops/scripts/verify-cancellation.ts can exercise it outside Next.
import { CANCELLATION_CUTOFF_HOURS } from "@/lib/business-rules";

export type CancellationPolicy =
  | { allowed: true; hoursUntilStart: number }
  | { allowed: false; reason: string; hoursUntilStart: number };

export function evaluateCancellationPolicy(
  refundPolicy: "standard" | "non_refundable",
  startsAt: string | Date,
  now: Date = new Date()
): CancellationPolicy {
  const hoursUntilStart =
    (new Date(startsAt).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (refundPolicy === "non_refundable") {
    return {
      allowed: false,
      reason: "This session is non-refundable.",
      hoursUntilStart,
    };
  }
  if (hoursUntilStart < CANCELLATION_CUTOFF_HOURS) {
    return {
      allowed: false,
      reason: `Cancellations must be made at least ${CANCELLATION_CUTOFF_HOURS} hours before the session.`,
      hoursUntilStart,
    };
  }
  return { allowed: true, hoursUntilStart };
}
