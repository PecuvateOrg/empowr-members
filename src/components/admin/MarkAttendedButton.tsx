"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormNotice } from "@/components/ui/form";

export function MarkAttendedButton({
  bookingId,
  alreadyAttended,
  courseSessionDate,
}: {
  bookingId: string;
  alreadyAttended: boolean;
  courseSessionDate?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  if (alreadyAttended || flipped) {
    return <FormNotice tone="success">Checked in</FormNotice>;
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/bookings/${bookingId}/${courseSessionDate ? "course-checkin" : "checkin"}`,
        {
          method: "POST",
          ...(courseSessionDate
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_date: courseSessionDate }),
              }
            : {}),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not check in this booking.");
        return;
      }
      if (body.rowFlipped || body.alreadyAttended) {
        setFlipped(true);
        router.refresh();
      } else {
        setError("This booking isn't confirmed, or was already checked in.");
      }
    } catch {
      setError("Could not check in this booking.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <FormNotice tone="error">{error}</FormNotice>}
      <Button onClick={submit} disabled={submitting}>
        {submitting ? "Checking in…" : "Mark attended"}
      </Button>
    </div>
  );
}
