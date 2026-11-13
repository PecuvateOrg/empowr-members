import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Participant } from "@/lib/types";

export type ReplacementParticipant = Pick<Participant, "id" | "name" | "person_id" | "account_id" | "medical_notes"> & {
  dob: string | null;
  default_travel_method: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  account: { user_id: string } | null;
};

export const REPLACEMENT_PARTICIPANT_COLUMNS =
  "id, name, dob, person_id, account_id, medical_notes, default_travel_method, emergency_contact_name, emergency_contact_phone, account:mem_accounts(user_id)";

export async function replacedParticipantIds(occurrenceId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("mem_booking_attendee_replacements")
    .select("participant_id, booking:mem_bookings!inner(occurrence_id, status)")
    .is("reversed_at", null)
    .eq("booking.occurrence_id", occurrenceId)
    .in("booking.status", ["pending_payment", "confirmed", "attended", "no_show"]);
  if (error) throw new Error("Could not load attendee corrections.");
  return (data ?? []).flatMap(row => typeof row.participant_id === "string" ? [row.participant_id] : []);
}

/** Admin-only overlay: payment and public ticket queries keep their original
 * participant. Safety data must always come from the actual attendee's account.
 * Fail closed if correction records cannot be read, never show the old skater. */
export async function applyAttendeeReplacements<T extends {
  id: string;
  participant: ReplacementParticipant | null;
}>(rows: T[]): Promise<(T & { attendeeReplaced: boolean; attendeeReplacementId?: string; originalParticipantName?: string })[]> {
  if (!rows.length) return [];
  const { data, error } = await createServiceClient()
    .from("mem_booking_attendee_replacements")
    .select(`id, booking_id, participant:mem_participants(${REPLACEMENT_PARTICIPANT_COLUMNS})`)
    .is("reversed_at", null)
    .in("booking_id", rows.map(row => row.id));
  if (error) throw new Error("Could not load attendee corrections.");
  const replacements = new Map((data ?? []).map(raw => {
    const row = raw as unknown as { id: string; booking_id: string; participant: ReplacementParticipant | null };
    return [row.booking_id, row] as const;
  }));
  return rows.map(row => replacements.has(row.id) ? {
    ...row,
    participant: replacements.get(row.id)?.participant ?? null,
    attendeeReplacementId: replacements.get(row.id)?.id,
    attendeeReplaced: true,
    originalParticipantName: row.participant?.name,
  } : { ...row, attendeeReplaced: false });
}
