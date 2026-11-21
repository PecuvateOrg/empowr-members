import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWaivers, persistWaiverMatches } from "@/lib/waivers";
import { privateRpcRefusal, type Equipment, type HireSize } from "@/lib/private-bookings";

export type JoinParticipant = { id: string; name: string; dob: string; person_id: string | null };

export type JoinResult =
  | { ok: true; place: unknown }
  | { ok: false; status: number; error: string; unsigned?: { id: string; name: string }[] };

// The one path onto a birthday party register, shared by a guest joining
// through the invite link and staff reconciling a guest who got stranded
// (#194). The skater stays on their own family's account, and the waiver must
// be that family's own: checked against the account holder's email, never the
// host's or the staff member's. Capacity, duplicates and the start-time cutoff
// are enforced by mem_join_private_booking.
export async function joinPrivateBooking(
  service: SupabaseClient,
  args: {
    bookingId: string;
    accountId: string;
    accountEmail: string;
    participant: JoinParticipant;
    equipment: Equipment;
    hireSize: HireSize | null;
    isBirthdayPerson: boolean;
  }
): Promise<JoinResult> {
  const [waiver] = await checkWaivers(args.accountEmail, [args.participant]);
  await persistWaiverMatches(waiver ? [waiver] : [], [args.participant]);
  if (!waiver?.signed) {
    return {
      ok: false,
      status: 409,
      error: "waiver_required",
      unsigned: [{ id: args.participant.id, name: args.participant.name }],
    };
  }

  const { data: place, error } = await service.rpc("mem_join_private_booking", {
    p_booking_id: args.bookingId,
    p_account_id: args.accountId,
    p_participant_id: args.participant.id,
    p_equipment: args.equipment,
    p_hire_size: args.equipment === "hire" ? args.hireSize : null,
    p_is_birthday_person: args.isBirthdayPerson,
  });
  if (error) {
    const refusal = privateRpcRefusal(error.message);
    if (refusal) return { ok: false, status: refusal.status, error: refusal.message };
    console.error("private join failed", error);
    return { ok: false, status: 500, error: "Could not register — please try again." };
  }
  return { ok: true, place };
}
