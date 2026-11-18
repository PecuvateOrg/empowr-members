"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button, FormNotice, Label, Textarea } from "@/components/ui/form";

export function AdminUndoCheckin({
  bookingId,
  participantName,
  replacementId,
}: {
  bookingId: string;
  participantName: string;
  replacementId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(replacementId ? "Replacement recorded by mistake" : "Marked attended by mistake");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undoCheckin() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/bookings/${bookingId}/${replacementId ? "replace-attendee" : "undo-checkin"}`,
        {
          method: replacementId ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, ...(replacementId ? { replacement_id: replacementId } : {}) }),
        },
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "Could not undo this check-in.");
      }

      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not undo this check-in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-red-dark underline"
      >
        <Undo2 className="h-4 w-4" aria-hidden />
        {replacementId ? "Undo replacement" : "Undo check-in"}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-red bg-red-soft p-4">
      <div>
        <p className="font-bold text-black">
          {replacementId ? `Undo replacement and restore ${participantName}?` : `Undo check-in for ${participantName}?`}
        </p>
        <p className="mt-1 text-sm text-mid">
          {replacementId
            ? "This restores the original attendee and their previous attendance status. Payment stays unchanged. Both the replacement and this reversal remain in the staff history."
            : "This changes the booking back to confirmed. The correction and reason will be recorded."}
        </p>
      </div>

      <div>
        <Label htmlFor={`undo-checkin-reason-${bookingId}`}>
          Reason for correction
        </Label>
        <Textarea
          id={`undo-checkin-reason-${bookingId}`}
          className="mt-1"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
        />
      </div>

      {error && <FormNotice tone="error">{error}</FormNotice>}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          onClick={undoCheckin}
          disabled={submitting || reason.trim().length < 3}
        >
          {submitting ? "Undoing…" : "Confirm undo"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
