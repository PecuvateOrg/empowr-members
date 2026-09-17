// Server-side reads behind self-serve booking transfer — loading the booking
// being moved, and listing the dates it may be moved to.
//
// Split out of the route for one reason: the list of offered dates and the
// check the move is finally judged by MUST come from the same rules. If the
// picker offers a date the POST then refuses, the member gets an error they
// did nothing to cause and cannot act on. So every filter here has a
// counterpart in mem_transfer_booking() or in evaluateTransferPolicy(), and
// the comments name it.
//
// The one filter that exists ONLY here is the age re-check. It is not a race,
// so it does not belong in the lock; but a child can cross an offering's
// age_max between the date they booked and the date they want to move to, and
// Sk8 Skool for Kidz has exactly that bound. Offering such a date and then
// refusing it at the door is the failure this prevents.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { occurrenceCapacities } from "@/lib/catalogue";
import { isAgeEligible } from "@/lib/age";
import { isTransferTargetEligible } from "@/lib/transfer";
import { TRANSFER_CUTOFF_HOURS } from "@/lib/business-rules";

export type TransferBooking = {
  id: string;
  status: string;
  occurrenceId: string;
  startsAt: string;
  endsAt: string;
  transferredAt: string | null;
  participantId: string;
  participantName: string;
  participantDob: string | null;
  offeringId: string;
  offeringTitle: string;
  transferable: boolean;
  enrolmentScope: "per_occurrence" | "per_run";
  ageMin: number | null;
  ageMax: number | null;
};

export type TransferTarget = {
  occurrenceId: string;
  startsAt: string;
  endsAt: string;
  /** Places left, or null where the session is uncapped. */
  placesLeft: number | null;
};

type BookingQueryRow = {
  id: string;
  status: string;
  occurrence_id: string | null;
  transferred_at: string | null;
  participant: { id: string; name: string; dob: string | null } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    offering: {
      id: string;
      title: string;
      transferable: boolean;
      enrolment_scope: "per_occurrence" | "per_run";
      age_min: number | null;
      age_max: number | null;
    } | null;
  } | null;
};

/** Load one booking for transfer, scoped to its owning account.
 *
 *  Returns null for "not this account's booking" and for "not an occurrence
 *  booking" alike — a caller must not be able to tell the two apart, or the
 *  route becomes an oracle for which booking ids exist. */
export async function loadTransferBooking(
  bookingId: string,
  accountId: string
): Promise<TransferBooking | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(
      `id, status, occurrence_id, transferred_at,
       participant:mem_participants(id, name, dob),
       occurrence:mem_occurrences(starts_at, ends_at,
         offering:mem_offerings(id, title, transferable, enrolment_scope, age_min, age_max))`
    )
    .eq("id", bookingId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    console.error("loadTransferBooking read failed", bookingId, error);
    throw new Error("transfer_booking_read_failed");
  }
  const row = data as unknown as BookingQueryRow | null;
  const offering = row?.occurrence?.offering;
  if (!row || !row.occurrence_id || !row.occurrence || !offering || !row.participant) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
    occurrenceId: row.occurrence_id,
    startsAt: row.occurrence.starts_at,
    endsAt: row.occurrence.ends_at,
    transferredAt: row.transferred_at,
    participantId: row.participant.id,
    participantName: row.participant.name,
    participantDob: row.participant.dob,
    offeringId: offering.id,
    offeringTitle: offering.title,
    transferable: offering.transferable,
    enrolmentScope: offering.enrolment_scope,
    ageMin: offering.age_min,
    ageMax: offering.age_max,
  };
}

/**
 * The dates this booking may be moved to.
 *
 * Mirrors mem_transfer_booking()'s target validation exactly — same offering
 * (decision #3), `status = 'scheduled'`, at least TRANSFER_CUTOFF_HOURS away,
 * and a capacity count taken from the same counters the hold function
 * enforces — plus the two things SQL cannot offer a picker:
 *   * the age re-check, evaluated ON the target date; and
 *   * dropping dates this participant already holds a live booking on, which
 *     the unique index would reject as mem_duplicate_booking.
 */
export async function listTransferTargets(
  booking: TransferBooking,
  limit = 12
): Promise<TransferTarget[]> {
  const service = createServiceClient();

  // Prefilter in SQL so the query stays index-friendly; isTransferTargetEligible
  // below is the authority on the boundary itself, so the two cannot disagree
  // about the exact cutoff instant.
  const earliest = new Date(
    Date.now() + TRANSFER_CUTOFF_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await service
    .from("mem_occurrences")
    .select("id, starts_at, ends_at")
    .eq("offering_id", booking.offeringId)
    .eq("status", "scheduled")
    .gte("starts_at", earliest)
    .neq("id", booking.occurrenceId)
    .order("starts_at", { ascending: true })
    .limit(limit * 3);
  if (error) {
    console.error("listTransferTargets read failed", booking.id, error);
    throw new Error("transfer_targets_read_failed");
  }
  const rows = (data ?? []) as { id: string; starts_at: string; ends_at: string }[];
  if (rows.length === 0) return [];

  // Dates this participant is already on. The partial unique index counts
  // pending_payment and confirmed only, so this must match it — filtering a
  // wider set would hide a date the member could legitimately move to.
  const { data: heldData, error: heldError } = await service
    .from("mem_bookings")
    .select("occurrence_id")
    .eq("participant_id", booking.participantId)
    .in("status", ["pending_payment", "confirmed"])
    .in("occurrence_id", rows.map((r) => r.id));
  if (heldError) {
    console.error("listTransferTargets held read failed", booking.id, heldError);
    throw new Error("transfer_targets_read_failed");
  }
  const alreadyHeld = new Set(
    ((heldData ?? []) as { occurrence_id: string | null }[])
      .map((r) => r.occurrence_id)
      .filter((id): id is string => id !== null)
  );

  const capacities = await occurrenceCapacities(rows.map((r) => r.id));

  const targets: TransferTarget[] = [];
  for (const row of rows) {
    if (alreadyHeld.has(row.id)) continue;

    // The cutoff, judged by the one shared helper the route and the RPC's
    // `>=` both agree with. A member must never be offered a date that would
    // leave them unable to cancel or move again the moment they took it.
    if (!isTransferTargetEligible(row.starts_at)) continue;

    // Age is judged on the target date, not today — see the header.
    if (
      booking.participantDob &&
      !isAgeEligible(
        booking.participantDob,
        booking.ageMin,
        booking.ageMax,
        new Date(row.starts_at)
      )
    ) {
      continue;
    }

    const capacity = capacities.get(row.id);
    // An id missing from the counters means the read returned nothing for it.
    // Treat that as "unknown", not "unlimited" — offering a date whose
    // fullness we could not establish is how a member gets refused at the
    // moment they act.
    if (!capacity) continue;
    const placesLeft =
      capacity.capacity === null ? null : capacity.capacity - capacity.booked;
    if (placesLeft !== null && placesLeft <= 0) continue;

    targets.push({
      occurrenceId: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      placesLeft,
    });
    if (targets.length >= limit) break;
  }
  return targets;
}
