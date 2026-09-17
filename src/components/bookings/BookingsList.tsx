"use client";

// Upcoming/past booking lists, with inline self-serve cancellation and
// transfer.
//
// Programme Policies v1.2 (published 2026-09-02) replaced v1.1's "all
// bookings are final" with a 48-hour member-cancellable window, so the
// cancel action returned here. The one-time date move it also promises was
// unbuilt until 2026-09-17 and is the "Move to another date" action below.
//
// Both per-row policies are RENDER-TIME ESTIMATES computed on the server;
// the POST routes re-check them and are authoritative — a page left open
// past the cutoff gets refused there, not here.
//
// Refund to the card is the only cancellation outcome offered. See
// lib/cancellation.ts for why there is no credit option.
//
// ⚠️ The available dates are NOT props. They need a capacity read per
// booking, so they are fetched from GET /api/bookings/[id]/transfer only when
// a member opens the picker — see the page's header comment.
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, CalendarX2, Ticket } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import type { CancellationPolicy } from "@/lib/cancellation";
import type { TransferPolicy } from "@/lib/transfer";
import { TRANSFER_CUTOFF_HOURS } from "@/lib/business-rules";
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
  /** As `cancellation`, and additionally null for course-run bookings,
   *  which have no single date to move. */
  transfer: TransferPolicy | null;
};

type TransferTargetView = {
  occurrence_id: string;
  when: string;
  places_left: number | null;
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
        b.id === id
          ? { ...b, status: "refunded", cancellation: null, transfer: null }
          : b
      )
    );
  }

  /** A moved booking keeps its position in the list even though its date
   *  changed. Re-sorting under the member's cursor would make the row they
   *  just acted on jump somewhere else; the new date is already stated in
   *  the row and in the email, and a reload puts it in order. */
  function onTransferred(id: string, when: string) {
    setBookings((list) =>
      // transfer is cleared rather than recomputed: the booking has now used
      // its one move, so no further move is offered.
      list.map((b) => (b.id === id ? { ...b, when, transfer: null } : b))
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
                onTransferred={onTransferred}
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
  onTransferred,
}: {
  booking: BookingView;
  onCancelled: (id: string) => void;
  onTransferred: (id: string, when: string) => void;
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

      {booking.status === "confirmed" && booking.transfer && (
        <TransferPanel booking={booking} onTransferred={onTransferred} />
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

/**
 * "Move to another date" for one booking.
 *
 * ⚠️ THE DEPARTURE-CONSENT LINE AFTER A SUCCESSFUL MOVE IS NOT DECORATION.
 * A departure consent is agreed for one session date and does not travel
 * with the booking, so a parent who authorised their child to leave alone
 * has authorised nothing for the new date and staff will expect to hand
 * that child over in person. The member is told here and in the email; this
 * is the only moment they are looking at the change. Do not fold it into a
 * generic success message.
 */
function TransferPanel({
  booking,
  onTransferred,
}: {
  booking: BookingView;
  onTransferred: (id: string, when: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState<TransferTargetView[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ when: string; consent: boolean } | null>(
    null
  );

  const policy = booking.transfer;

  async function openPicker() {
    setOpen(true);
    setError(null);
    if (targets !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/transfer`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not load available dates.");
        setTargets([]);
        return;
      }
      setTargets((body.targets ?? []) as TransferTargetView[]);
    } catch {
      setError("Could not load available dates — please try again.");
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }

  async function move() {
    if (!chosen) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrence_id: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not move this booking — please try again.");
        return;
      }
      setMoved({
        when: body.when as string,
        consent: Boolean(body.departure_consent_needed),
      });
      setOpen(false);
      onTransferred(booking.id, body.when as string);
    } catch {
      setError("Could not move this booking — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (moved) {
    return (
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <FormNotice tone="success">
          Moved to {moved.when}. Your existing ticket still works — the same QR
          code now shows the new date.
        </FormNotice>
        {moved.consent && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Please tell us again how {booking.participantName} will leave.
            Departure arrangements apply to one date only, so anything you told
            us for the old date does not carry over — otherwise our staff will
            expect them to be collected in person.
          </p>
        )}
      </div>
    );
  }

  if (!policy) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {!open ? (
        <button
          type="button"
          onClick={openPicker}
          className="text-sm font-bold text-mid underline transition-colors hover:text-blue"
        >
          Move to another date
        </button>
      ) : !policy.allowed ? (
        <FormNotice tone="error">{policy.reason}</FormNotice>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-mid">
            Pick another date for the same session. Nothing is charged or
            refunded, and a booking can be moved once. Dates less than{" "}
            {TRANSFER_CUTOFF_HOURS} hours away aren&apos;t listed — moving onto
            one would leave you unable to cancel it.
          </p>

          {loading && (
            <p className="text-sm font-semibold text-muted">Loading dates…</p>
          )}

          {!loading && targets !== null && targets.length === 0 && !error && (
            <FormNotice tone="error">
              There are no other dates available for this session at the moment.
            </FormNotice>
          )}

          {!loading && targets !== null && targets.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="sr-only">
                Choose a new date for {booking.offeringTitle}
              </legend>
              {targets.map((target) => (
                <label
                  key={target.occurrence_id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-black transition-colors hover:border-blue"
                >
                  <input
                    type="radio"
                    name={`transfer-${booking.id}`}
                    value={target.occurrence_id}
                    checked={chosen === target.occurrence_id}
                    onChange={() => setChosen(target.occurrence_id)}
                    className="h-4 w-4 accent-blue"
                  />
                  <span className="flex-1">{target.when}</span>
                  {target.places_left !== null && target.places_left <= 3 && (
                    <span className="text-xs font-bold text-mid">
                      {target.places_left} left
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
          )}

          {error && <FormNotice tone="error">{error}</FormNotice>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={move} disabled={submitting || !chosen}>
              {submitting ? "Moving…" : "Move booking"}
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
      )}
    </div>
  );
}
