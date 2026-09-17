// Pre-purchase cancel/move position, shown on /sessions/[slug] and /book/[id].
//
// Restates Programme Policies v1.2 §5 / Terms & Conditions v1.2 §3. The
// cutoff is read from business-rules, never inlined, so the number cannot
// drift from the gates that enforce it.
//
// ⚠️ THE MOVE LINE IS GATED ON THE SAME FLAG THE TRANSFER ROUTE READS.
// Until 2026-09-17 this component said nothing about moving dates, because
// the published policy granted a one-time move that no code implemented and
// copy must never promise a control the member cannot find. Transfer now
// exists, but it is per-offering: mem_offerings.transferable is what
// /api/bookings/[id]/transfer gates on, so passing that same flag in here
// makes this copy incapable of leading the capability. Do NOT replace the
// prop with a hardcoded sentence — that is exactly the drift this avoids.
import { Info } from "lucide-react";
import { CANCELLATION_CUTOFF_HOURS, TRANSFER_CUTOFF_HOURS } from "@/lib/business-rules";

export function PolicyNotice({
  refundPolicy,
  transferable,
  enrolmentScope,
}: {
  refundPolicy: "standard" | "non_refundable";
  /** mem_offerings.transferable. Only a true value produces the move line. */
  transferable: boolean;
  /** Courses are sold as one block and cannot be moved a date at a time,
   *  so they never get the move line even if the flag is on. This mirrors
   *  evaluateTransferPolicy's first two checks, in the same order. */
  enrolmentScope: "per_occurrence" | "per_run";
}) {
  const moveLine =
    transferable &&
    enrolmentScope === "per_occurrence" &&
    refundPolicy !== "non_refundable"
      ? ` You can also move this booking once to another date of the same session, as long as both dates are at least ${TRANSFER_CUTOFF_HOURS} hours away.`
      : "";

  return (
    <p className="flex items-start gap-2 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {refundPolicy === "non_refundable"
        ? "This booking is non-refundable and cannot be cancelled or moved, whatever notice is given."
        : `Cancel from your account at least ${CANCELLATION_CUTOFF_HOURS} hours before the session and we'll refund the full amount to your card. Inside ${CANCELLATION_CUTOFF_HOURS} hours, bookings can't be cancelled and no refund is due.${moveLine}`}
    </p>
  );
}
