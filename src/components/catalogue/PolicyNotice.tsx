// Pre-purchase refund position, shown on /sessions/[slug] and /book/[id].
//
// Restates Programme Policies v1.2 §5 / Terms & Conditions v1.2 §3. The
// cutoff is read from business-rules, never inlined, so the number cannot
// drift from the gate that enforces it.
//
// ⚠️ The published policy ALSO grants a one-time move to another date.
// That is deliberately NOT mentioned here yet: transfer is Phase C and is
// not built, and copy must never promise a control the member cannot
// find. Add the move line in the same commit that ships the transfer UI.
import { Info } from "lucide-react";
import { CANCELLATION_CUTOFF_HOURS } from "@/lib/business-rules";

export function PolicyNotice({
  refundPolicy,
}: {
  refundPolicy: "standard" | "non_refundable";
}) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {refundPolicy === "non_refundable"
        ? "This booking is non-refundable and cannot be cancelled or moved, whatever notice is given."
        : `Cancel from your account at least ${CANCELLATION_CUTOFF_HOURS} hours before the session and we'll refund the full amount to your card. Inside ${CANCELLATION_CUTOFF_HOURS} hours, bookings can't be cancelled and no refund is due.`}
    </p>
  );
}
