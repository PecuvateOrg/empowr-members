// Upcoming/past booking lists.
//
// Confirmed bookings deliberately carry NO cancel/transfer messaging here.
// The "email us, bookings are final" notice was removed 2026-08-19: this
// is the post-purchase view, the pre-purchase PolicyNotice on
// /sessions/[slug] and /book/[id] is what states the refund position
// before payment, and Programme Policies v1.2 is set to replace that
// stance with member self-serve cancel/transfer anyway. Do not reinstate
// a contact-only notice here without checking which policy version is
// actually live.
import Link from "next/link";
import { CalendarClock, CalendarX2, Ticket } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";

export type BookingView = {
  id: string;
  status: BookingStatus;
  offeringTitle: string;
  when: string;
  participantName: string;
  pricePaidPence: number | null;
  startsAtMs: number;
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
  return (
    <div className="space-y-10">
      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
          <CalendarClock className="h-5 w-5 text-blue" aria-hidden /> Upcoming
        </h2>
        {upcoming.length === 0 ? (
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
            {upcoming.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
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

function BookingRow({ booking }: { booking: BookingView }) {
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
    </li>
  );
}
