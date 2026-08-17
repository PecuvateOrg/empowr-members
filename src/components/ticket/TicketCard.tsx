"use client";

// The in-house replacement for a PassKit wallet pass — a printable/
// screenshottable "ticket" staff scan at check-in. Presentational only,
// no backend calls; the QR image is pre-rendered server-side by the page
// (lib/qr.ts) so this component needs no client JS beyond the print button.
import Link from "next/link";
import { Ticket } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { TicketData } from "@/lib/ticket";

export function TicketCard({
  ticket,
  qrDataUrl,
}: {
  ticket: TicketData;
  qrDataUrl: string | null;
}) {
  const isAttended = ticket.status === "attended";

  return (
    <div className="mx-auto max-w-md">
      <div
        className={`flex items-center justify-center gap-2 rounded-t-2xl px-4 py-3 text-center text-sm font-extrabold text-white ${
          isAttended ? "bg-blue-dark" : "bg-blue"
        }`}
      >
        <Ticket className="h-4 w-4" aria-hidden />
        {isAttended ? "Checked in" : "Booking confirmed"}
      </div>

      <div className="rounded-b-2xl bg-card shadow-sm">
        <div className="rounded-t-none bg-gradient-to-br from-blue to-blue-dark px-6 py-8 text-cream">
          <p className="text-xs font-black tracking-[0.22em] uppercase opacity-90">
            Session pass
          </p>
          <h1 className="mt-2 text-3xl leading-tight font-black">
            {ticket.offeringTitle}
          </h1>
          <p className="mt-1 text-sm opacity-90">
            {ticket.participantFirstName
              ? `Booked for ${ticket.participantFirstName}`
              : "Booking confirmed"}
          </p>
        </div>

        <div className="relative h-0">
          <div className="absolute top-0 right-0 left-0 border-t-2 border-dashed border-line" />
          <div className="absolute top-[-13px] left-[-13px] h-[26px] w-[26px] rounded-full bg-cream" />
          <div className="absolute top-[-13px] right-[-13px] h-[26px] w-[26px] rounded-full bg-cream" />
        </div>

        <div className="flex flex-col items-center gap-4 px-6 py-8">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Check-in QR code"
              width={150}
              height={150}
              className="rounded-xl bg-white p-3 shadow-sm"
            />
          ) : (
            <div className="flex h-[150px] w-[150px] items-center justify-center rounded-xl bg-blue-pale text-center text-xs font-semibold text-blue-dark">
              QR unavailable — show this page at check-in
            </div>
          )}

          <p className="font-mono text-xs tracking-wider text-muted">
            REF {ticket.displayRef}
          </p>

          <div className="grid w-full grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <p className="text-[10px] font-bold tracking-wider text-red-dark uppercase">
                When
              </p>
              <p className="text-sm font-bold text-blue-dark">{ticket.when}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-wider text-red-dark uppercase">
                Where
              </p>
              <p className="text-sm font-bold text-blue-dark">
                {ticket.venue?.name ?? "To be confirmed"}
              </p>
            </div>
          </div>

          <div className="flex w-full items-center justify-between rounded-lg border border-line bg-blue-soft px-3.5 py-2.5 text-xs text-mid">
            <span>Payment</span>
            <span className="font-bold text-blue-dark">
              {ticket.amountPaidPence !== null
                ? `${formatPrice(ticket.amountPaidPence)} paid`
                : "—"}
            </span>
          </div>

          <div className="flex w-full gap-2.5">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-sm font-extrabold text-black transition-colors hover:border-blue hover:text-blue"
            >
              Save / Print
            </button>
            <Link
              href="/sessions"
              className="flex-1 rounded-full bg-blue-dark px-4 py-2.5 text-center text-sm font-extrabold text-white transition-colors hover:bg-blue"
            >
              Browse sessions
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-muted">
        Show this page at check-in — staff will scan the QR code. Need to
        change or cancel? <strong className="text-black">enquiries@empowrcic.org</strong>
      </p>
    </div>
  );
}
