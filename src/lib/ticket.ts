// Public ticket page data — the in-house replacement for a PassKit wallet
// pass. Deliberately its own selector, not shared with lib/admin-data.ts's
// staff check-in lookup: this one is served on an UNAUTHENTICATED route
// (see planning note on src/app/(public)/ticket/[bookingId]/page.tsx), so
// it must only ever select ticket-safe fields — never email, DOB, medical
// notes, emergency contact, or Stripe ids. Keeping the two selectors
// structurally separate is what makes that boundary enforceable rather
// than just documented.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import type { BookingStatus } from "@/lib/types";
import type { EmailVenue } from "@/lib/emails/types";

export type TicketData = {
  id: string;
  status: BookingStatus;
  offeringTitle: string;
  when: string;
  venue: EmailVenue | null;
  participantFirstName: string;
  amountPaidPence: number | null;
  /** Cosmetic only — derived from the id, not a separate lookup key. */
  displayRef: string;
};

type TicketRow = {
  id: string;
  status: BookingStatus;
  price_paid_pence: number | null;
  participant: { name: string } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    venue: EmailVenue | null;
    offering: { title: string; venue: EmailVenue | null } | null;
  } | null;
  course_run: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
    offering: { title: string; venue: EmailVenue | null } | null;
  } | null;
};

const TICKET_SELECT = `
  id, status, price_paid_pence,
  participant:mem_participants(name),
  occurrence:mem_occurrences(
    starts_at, ends_at,
    venue:mem_venues(name, address, postcode),
    offering:mem_offerings(title, venue:mem_venues(name, address, postcode))
  ),
  course_run:mem_course_runs(
    label, starts_on, ends_on,
    offering:mem_offerings(title, venue:mem_venues(name, address, postcode))
  )
`;

/** Formats a booking id into the "REF ABCD1234" cosmetic shown on the
 *  ticket — not a secret, not a lookup key, purely decorative. */
function displayRef(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Single-row lookup by booking id for the unauthenticated ticket page.
 *  Returns null if the id doesn't exist or carries no recognisable
 *  offering (mirrors notifications.ts's summariseRows null case). */
export async function getTicket(bookingId: string): Promise<TicketData | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(TICKET_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    console.error("getTicket failed", bookingId, error);
    return null;
  }
  const row = data as unknown as TicketRow | null;
  if (!row) return null;

  const offering = row.occurrence?.offering ?? row.course_run?.offering;
  if (!offering) return null;

  const when = row.occurrence
    ? formatOccurrence(row.occurrence.starts_at, row.occurrence.ends_at)
    : row.course_run
      ? courseRunWhen(row.course_run)
      : "";

  const venue = row.occurrence
    ? (row.occurrence.venue ?? offering.venue)
    : offering.venue;

  return {
    id: row.id,
    status: row.status,
    offeringTitle: offering.title,
    when,
    venue,
    participantFirstName: row.participant?.name?.split(" ")[0] ?? "",
    amountPaidPence: row.price_paid_pence,
    displayRef: displayRef(row.id),
  };
}
