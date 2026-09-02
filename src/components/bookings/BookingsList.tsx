"use client";

// Upcoming/past booking lists, with inline self-serve cancellation.
//
// Programme Policies v1.2 (published 2026-09-02) replaced v1.1's "all
// bookings are final" with a 48-hour member-cancellable window, so the
// cancel action returned here. The per-row policy is a RENDER-TIME
// ESTIMATE computed on the server; POST /api/bookings/[id]/cancel
// re-checks it and is authoritative — a page left open past the cutoff
// gets refused there, not here.
//
// Refund to the card is the only outcome offered. See lib/cancellation.ts
// for why there is no credit option.
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarX2, Ticket } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import type { CancellationPolicy } from "@/lib/cancellation";
import type { BookingStatus } from "@/lib/types";

export type BookingView = {
  id: string;
  status: BookingStatus;
  offeringTitle: string;
  when: string;
  participantName: string;
  pricePaidPence: number | null;
  startsAtMs: number;
  /** Only set for confirmed bookings — null means "not applicable"
   *  (already settled, or still pending payment). */
  cancellation: CancellationPolicy | null;
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Payment pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  credited: "Cancelled — credited",
  refunded: "Cancelled — refunded",
  attended: "Attended",
  no_show: "No-show",
};

const STATUS_STYLES: Record<BookingStatus, string> = {
  pending_payment: "bg-blue-soft text-blue-dark",
  confirmed: "bg-blue-pale text-blue-dark",
  cancelled: "bg-line text-mid",
  credited: "bg-line text-mid",
  refunded: "bg-line text-mid",
  attended: "bg-blue-pale text-blue-dark",
  no_show: "bg-red-soft text-red-dark",
};

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function BookingsList({
  upcoming,
  past,
}: {
  upcoming: BookingView[];
  past: BookingView[];
}) {
  // Held in state so a cancelled row re-badges without a round trip. The
  // row stays in Upcoming rather than jumping to Past — the session has
  // not happened, only the booking ended.
  const [bookings, setBookings] = useState(upcoming);

  function onCancelled(id: string) {
    setBookings((list) =>
      list.map((b) =>
        b.id === id ? { ...b, status: "refunded", cancellation: null } : b
      )
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <CalendarClock className="h-5 w-5 text-blue" aria-hidden /> Upcoming
        </h2>
        {bookings.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-card px-6 py-10 text-center shadow-sm">
            <CalendarClock
              className="mx-auto h-8 w-8 text-blue-light"
              aria-hidden
            />
            <p className="mt-3 font-extrabold text-black">
              No upcoming bookings yet
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm font-semibold text-mid">
              Once you book a session it will show up here, with your ticket.
            </p>
            <Link
              href="/sessions"
              className="mt-5 inline-flex rounded-full bg-blue px-5 py-3 text-sm font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
            >
              Browse sessions
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {bookings.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                onCancelled={onCancelled}
              />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
            <CalendarX2 className="h-5 w-5 text-mid" aria-hidden /> Past
          </h2>
          <ul className="mt-4 space-y-3">
            {past.map((booking) => (
              <li
                key={booking.id}
                className="rounded-xl border border-line p-4 opacity-80"
              >
                <BookingSummary booking={booking} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingSummary({ booking }: { booking: BookingView }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-extrabold text-black">{booking.offeringTitle}</p>
        <p className="text-sm font-semibold text-mid">
          {booking.when} · {booking.participantName}
        </p>
        {booking.pricePaidPence !== null && (
          <p className="text-sm font-semibold text-muted">
            {formatPrice(booking.pricePaidPence)} paid
          </p>
        )}
      </div>
      <StatusBadge status={booking.status} />
    </div>
  );
}

function BookingRow({
  booking,
  onCancelled,
}: {
  booking: BookingView;
  onCancelled: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.error ?? "Could not cancel this booking — please try again."
        );
        return;
      }
      onCancelled(booking.id);
      setOpen(false);
    } catch {
      setError("Could not cancel this booking — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="rounded-xl border border-line p-4">
      <BookingSummary booking={booking} />

      {(booking.status === "confirmed" || booking.status === "attended") && (
        <div className="mt-3">
          <Link
            href={`/ticket/${booking.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue hover:text-blue-dark"
          >
            <Ticket className="h-4 w-4" aria-hidden /> View ticket
          </Link>
        </div>
      )}

      {booking.status === "confirmed" && booking.cancellation && (
        <div className="mt-3 border-t border-line pt-3">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm font-bold text-mid underline transition-colors hover:text-blue"
            >
              Cancel booking
            </button>
          ) : booking.cancellation.allowed ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-mid">
                {booking.pricePaidPence
                  ? `We'll refund ${formatPrice(booking.pricePaidPence)} to the card you paid with. Refunds usually land within 5–10 working days.`
                  : "We'll cancel this booking and free the place."}
              </p>
              {error && <FormNotice tone="error">{error}</FormNotice>}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={cancel}
                  disabled={submitting}
                >
                  {submitting ? "Cancelling…" : "Cancel and refund"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="border-transparent shadow-none hover:border-line"
                >
                  Never mind
                </Button>
              </div>
            </div>
          ) : (
            <FormNotice tone="error">{booking.cancellation.reason}</FormNotice>
          )}
        </div>
      )}
    </li>
  );
}
