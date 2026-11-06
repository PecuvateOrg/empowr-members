import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { occurrenceCapacities } from "@/lib/catalogue";
import { isAgeEligible } from "@/lib/age";
import { formatOccurrence } from "@/lib/format";

export type AdminTransferBooking = {
  id: string;
  accountId: string;
  status: string;
  occurrenceId: string;
  startsAt: string;
  endsAt: string;
  participantId: string;
  participantName: string;
  participantDob: string | null;
  offeringId: string;
  offeringTitle: string;
  ageMin: number | null;
  ageMax: number | null;
};

type BookingRow = {
  id: string; account_id: string; status: string; occurrence_id: string | null;
  participant: { id: string; name: string; dob: string | null } | null;
  occurrence: { starts_at: string; ends_at: string; offering: {
    id: string; title: string; age_min: number | null; age_max: number | null;
  } | null } | null;
};

export async function loadAdminTransferBooking(id: string): Promise<AdminTransferBooking | null> {
  const { data, error } = await createServiceClient().from("mem_bookings")
    .select(`id, account_id, status, occurrence_id,
      participant:mem_participants(id,name,dob),
      occurrence:mem_occurrences(starts_at,ends_at,
        offering:mem_offerings(id,title,age_min,age_max))`)
    .eq("id", id).maybeSingle();
  if (error) throw new Error("admin_transfer_booking_read_failed");
  const row = data as unknown as BookingRow | null;
  const offering = row?.occurrence?.offering;
  if (!row || !row.occurrence_id || !row.occurrence || !row.participant || !offering) return null;
  return {
    id: row.id, accountId: row.account_id, status: row.status,
    occurrenceId: row.occurrence_id, startsAt: row.occurrence.starts_at,
    endsAt: row.occurrence.ends_at, participantId: row.participant.id,
    participantName: row.participant.name, participantDob: row.participant.dob,
    offeringId: offering.id, offeringTitle: offering.title,
    ageMin: offering.age_min, ageMax: offering.age_max,
  };
}

export async function listAdminTransferTargets(booking: AdminTransferBooking) {
  const service = createServiceClient();
  const { data, error } = await service.from("mem_occurrences")
    .select("id,starts_at,ends_at").eq("offering_id", booking.offeringId)
    .eq("status", "scheduled").gt("starts_at", new Date().toISOString())
    .neq("id", booking.occurrenceId).order("starts_at").limit(36);
  if (error) throw new Error("admin_transfer_targets_read_failed");
  const rows = (data ?? []) as { id: string; starts_at: string; ends_at: string }[];
  if (!rows.length) return [];

  const { data: held, error: heldError } = await service.from("mem_bookings")
    .select("occurrence_id").eq("participant_id", booking.participantId)
    .in("status", ["pending_payment", "confirmed", "attended"])
    .in("occurrence_id", rows.map((row) => row.id));
  if (heldError) throw new Error("admin_transfer_targets_read_failed");
  const alreadyHeld = new Set((held ?? []).map((row) => row.occurrence_id as string));
  const capacities = await occurrenceCapacities(rows.map((row) => row.id));

  return rows.flatMap((row) => {
    if (alreadyHeld.has(row.id)) return [];
    if (booking.participantDob && !isAgeEligible(
      booking.participantDob, booking.ageMin, booking.ageMax, new Date(row.starts_at)
    )) return [];
    const capacity = capacities.get(row.id);
    if (!capacity) return [];
    const placesLeft = capacity.capacity === null ? null : capacity.capacity - capacity.booked;
    if (placesLeft !== null && placesLeft <= 0) return [];
    return [{
      occurrence_id: row.id,
      when: formatOccurrence(row.starts_at, row.ends_at),
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      places_left: placesLeft,
    }];
  });
}
