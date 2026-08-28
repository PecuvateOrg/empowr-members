"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormNotice } from "@/components/ui/form";

/**
 * Releases a pending_payment hold so its place goes back on sale.
 *
 * Confirms first, unlike MarkAttendedButton. Marking someone attended by
 * mistake is trivially corrected; releasing a hold cannot be undone from
 * here, and if the member pays seconds later the webhook finds nothing to
 * confirm and logs a paid-for-released-holds error needing a manual refund.
 */
export function ReleaseHoldButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function release() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/release`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not release this hold.");
        return;
      }
      // Refresh either way: rowFlipped false means it was already paid or
      // already swept, and the re-render shows staff which.
      router.refresh();
    } catch {
      setError("Could not release this hold.");
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <FormNotice tone="error">{error}</FormNotice>}
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            className="px-4 py-1.5 text-sm"
            onClick={release}
            disabled={submitting}
          >
            {submitting ? "Releasing…" : "Yes, release"}
          </Button>
          <Button
            variant="secondary"
            className="px-4 py-1.5 text-sm"
            onClick={() => setConfirming(false)}
            disabled={submitting}
          >
            Keep
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="px-4 py-1.5 text-sm"
          onClick={() => setConfirming(true)}
        >
          Release place
        </Button>
      )}
    </div>
  );
}
