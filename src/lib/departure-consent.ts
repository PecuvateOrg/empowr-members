// Per-booking departure consent — writes into Waivers' own departure_consents
// table (2026-08-10 decision: asked fresh at every booking rather than signed
// once like the waiver itself, since a parent's judgement on unaccompanied
// travel can reasonably differ session to session). Same table the standalone
// waiver.empowrcic.org app writes to, so staff check-in
// (staff_today_departure_consents) keeps working unchanged.
//
// person_id on each row is the signer's people.id, not the child's — children
// don't get their own people row (see waivers.ts). It's the same id already
// stamped onto the child's mem_participants.person_id by submitWaiver()/the
// checkWaivers() backfill, so the caller just passes that straight through.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { DepartureConsentEntry } from "@/lib/validation";

export type DepartureConsentRow = DepartureConsentEntry & {
  personId: string;
  childName: string;
  sessionDate: string; // YYYY-MM-DD
};

/** Write one departure_consents row per entry. Never throws — a failure
 *  here doesn't undo an already-confirmed booking; it's logged loudly so
 *  staff know to fall back to collecting the child in person. */
export async function recordDepartureConsents(
  entries: DepartureConsentRow[]
): Promise<void> {
  if (entries.length === 0) return;
  const service = createServiceClient();
  const { error } = await service.from("departure_consents").insert(
    entries.map((e) => ({
      person_id: e.personId,
      child_name: e.childName,
      travel_method: e.travel_method,
      travel_method_other: e.travel_method === "other" ? e.travel_method_other : null,
      confirm_mature: e.confirm_mature,
      confirm_knows_route: e.confirm_knows_route,
      confirm_will_inform_staff: e.confirm_will_inform_staff,
      confirm_accepts_responsibility: e.confirm_accepts_responsibility,
      confirm_understands_staff_override: e.confirm_understands_staff_override,
      session_date: e.sessionDate,
    }))
  );
  if (error) {
    console.error("departure_consents insert failed", error);
  }
}
