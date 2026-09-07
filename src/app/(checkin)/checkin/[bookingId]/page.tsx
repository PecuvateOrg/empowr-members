// Staff check-in lookup — reached by scanning a ticket's QR code (see
// src/app/(public)/ticket/[bookingId]/page.tsx). A read-only lookup, not
// an auto-mark: a GET must never mutate attendance (bots, link previews,
// back-button reloads), and staff need the visual-confirm step anyway
// for safeguarding. Inherits the standalone check-in layout's session and CHECKIN_EMAILS gate.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, User } from "lucide-react";
import { getBookingForCheckin } from "@/lib/admin-data";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";
import { MarkAttendedButton } from "@/components/admin/MarkAttendedButton";
import {
  WaiverBadge,
  DepartureLine,
  EmergencyContactLine,
  AgeLabel,
} from "@/components/admin/ParticipantSafetyInfo";

export const metadata: Metadata = { title: "Check in — Door Check-in" };
export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = await getBookingForCheckin(bookingId);
  if (!booking) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-pale">
            <User className="h-5 w-5 text-blue" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-extrabold text-black">
              {booking.participantName}
            </p>
            <p className="text-sm font-semibold text-mid">
              {booking.offeringTitle} · {booking.when}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2">
              <WaiverBadge signed={booking.waiverSigned} />
              <AgeLabel age={booking.age} />
            </p>
          </div>
        </div>

        {booking.medicalNotes && (
          <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-red-soft px-3 py-2.5 text-sm font-semibold text-red-dark">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            {booking.medicalNotes}
          </p>
        )}

        {/* The same answers the register gives. This screen is reached by
            scanning a ticket and, for some staff, is the only thing they look
            at — it used to show a name, a session, medical notes and a button,
            so a scanned ticket could be waved through with no waiver, no idea
            how a child leaves and nobody to ring. */}
        <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          {booking.departure.kind !== "not_applicable" && (
            <div>
              <dt className="font-bold text-mid">Leaving</dt>
              <dd className="mt-0.5">
                <DepartureLine departure={booking.departure} />
              </dd>
            </div>
          )}
          <div>
            <dt className="font-bold text-mid">Emergency contact</dt>
            <dd className="mt-0.5">
              <EmergencyContactLine contact={booking.emergencyContact} />
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm font-bold text-mid">
          Status: {BOOKING_STATUS_LABELS[booking.status]}
        </p>

        <div className="mt-5 border-t border-line pt-5">
          {booking.isCourseRun ? (
            <p className="text-sm font-semibold text-muted">
              This is a multi-week course booking — attendance for
              individual weeks isn&apos;t tracked here. Check them off on
              the register for the specific date instead.
            </p>
          ) : !booking.waiverSigned ? (
            /* The register refuses to offer check-in without a waiver. This
               screen offered the button regardless, so scanning a ticket was
               a way round the block the register enforces — the same person,
               the same door, two different answers. */
            <p className="rounded-lg bg-red-soft px-3 py-2.5 text-sm font-extrabold text-red-dark">
              No waiver — do not let them take part.
            </p>
          ) : booking.status === "confirmed" || booking.status === "attended" ? (
            <MarkAttendedButton
              bookingId={booking.id}
              alreadyAttended={booking.status === "attended"}
            />
          ) : (
            <p className="text-sm font-semibold text-muted">
              This booking isn&apos;t confirmed ({BOOKING_STATUS_LABELS[booking.status].toLowerCase()}) — nothing to check in.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
