"use client";

// One person on the register: a compact row, plus the detail behind a toggle.
//
// WHY THE DETAIL COLLAPSES. Departure and emergency contact arrived as two
// extra full-width table columns, taking the register from five columns to
// seven. On the tablets staff actually stand at a door with, that pushed the
// table into horizontal scroll — so the check-in button, the last column, went
// off-screen on the one screen whose entire job is pressing it. Medical notes
// followed them into the expander for the same reason: free text a parent
// wrote is the widest and least predictable thing on the row, and one long
// note stretched the table for everybody on it.
//
// WHAT DOES NOT COLLAPSE. A collapsed row reads as "nothing to see" in exactly
// the way an empty cell did before any of this was wired up, so the waiver
// badge and the SafetyFlags exceptions stay on the surface at all times —
// medical notes included, as a badge saying a note exists rather than the note
// itself. See the comment on SafetyFlags for which states qualify and why the
// routine ones deliberately do not.
//
// WHERE THE WAIVER SITS. Under the status, not under the name. "Confirmed" and
// "Waiver ✓" answer the same question — is this booking good to go — and the
// check-in cell beside them refuses to offer the button without both.
//
// Client-side because the open/closed state is per row and per person. The
// check-in buttons it renders are already client components; nesting them here
// costs nothing extra.

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RegisterRow } from "@/lib/admin-data";
import { formatPrice } from "@/lib/format";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";
import {
  WaiverBadge,
  DepartureLine,
  EmergencyContactLine,
  AgeLabel,
  SafetyFlags,
  MedicalNotesBlock,
} from "@/components/admin/ParticipantSafetyInfo";
import { MarkAttendedButton } from "@/components/admin/MarkAttendedButton";
import { ReleaseHoldButton } from "@/components/admin/ReleaseHoldButton";
import { equipmentDescription } from "@/lib/roller-equipment";

/** Kept in step with the <th> count in RegisterView by hand. A colSpan that
 *  drifts short leaves the detail row visibly narrower than the table.
 *  verify:register-safety-presence fails if these two disagree. */
const COLUMN_COUNT = 5;

export function RegisterBookingRow({ booking }: { booking: RegisterRow }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const name = booking.participant?.name ?? "—";
  const notes = booking.participant?.medical_notes ?? null;

  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <span className="block font-bold text-black">{name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {booking.age !== null && <AgeLabel age={booking.age} />}
            <SafetyFlags
              departure={booking.departure}
              emergencyContact={booking.emergencyContact}
              medicalNotes={notes}
            />
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="block font-semibold text-mid">
            {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
          </span>
          <span className="mt-1 block">
            <WaiverBadge signed={booking.waiverSigned} />
          </span>
        </td>
        <td className="px-4 py-3 font-semibold text-mid">
          {booking.source === "member" ? (
            <span className="rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
              Subscribed
            </span>
          ) : (
            <>
              {booking.price_paid_pence !== null
                ? formatPrice(booking.price_paid_pence)
                : "—"}
              {booking.source === "walk_in" && (
                <span className="ml-1.5 rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
                  Door
                </span>
              )}
            </>
          )}
        </td>
        <td className="px-4 py-3">
          {!booking.waiverSigned ? (
            <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
              No waiver — do not let them take part
            </span>
          ) : booking.status === "confirmed" ||
            booking.status === "attended" ? (
            <MarkAttendedButton
              bookingId={booking.id}
              alreadyAttended={booking.status === "attended"}
            />
          ) : booking.status === "pending_payment" ? (
            <ReleaseHoldButton bookingId={booking.id} />
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-2 py-3 text-right">
          {/* h-11 keeps the tap target at the 44px floor this repo audits
              against — a door presses this with a thumb, standing up. */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={detailId}
            className="relative ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-mid transition-colors hover:bg-blue-pale hover:text-blue"
          >
            <span className="sr-only">
              {open ? `Hide details for ${name}` : `Show details for ${name}`}
            </span>
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
        </td>
      </tr>

      {open && (
        <tr id={detailId} className="border-t-0!">
          <td colSpan={COLUMN_COUNT} className="bg-blue-pale/25 px-4 pb-4 pt-1">
            {/* Notes first and full width: it is the one a door acts on
                immediately, and a parent's free text needs the room. */}
            <MedicalNotesBlock notes={notes} />
            {booking.equipment !== undefined && <p className="mt-3 text-sm text-mid"><strong>Skates &amp; protective gear: </strong>{equipmentDescription(booking.equipment)}</p>}
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
              {/* Omitted for an adult, as on the scan screen: an empty
                  "Leaving" heading invites someone to wonder what is missing
                  when the honest answer is that the question does not apply. */}
              {booking.departure.kind !== "not_applicable" && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-mid">
                    Leaving
                  </dt>
                  <dd className="mt-1">
                    <DepartureLine departure={booking.departure} />
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-mid">
                  Emergency contact
                </dt>
                <dd className="mt-1">
                  <EmergencyContactLine contact={booking.emergencyContact} />
                </dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
