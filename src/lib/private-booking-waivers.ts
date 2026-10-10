// Live waiver status for the guests on a private booking. checkWaivers()
// takes one account email at a time, so places are grouped per account —
// the same approach the session register uses. A guest's waiver can lapse
// between registering and arriving, so the join-time check is not trusted.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWaivers } from "@/lib/waivers";
import { accountContact } from "@/lib/notifications";

type Place = {
  account_id: string;
  participant: { id: string; name: string; person_id: string | null } | null;
};

/** participant id → signed. */
export async function privateBookingWaivers(service: SupabaseClient, places: Place[]): Promise<Map<string, boolean>> {
  const signed = new Map<string, boolean>();
  const byAccount = new Map<string, Place[]>();
  for (const place of places) {
    const list = byAccount.get(place.account_id) ?? [];
    list.push(place);
    byAccount.set(place.account_id, list);
  }
  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, list]) => {
      const contact = await accountContact(service, accountId);
      const participants = list.flatMap((p) => (p.participant ? [p.participant] : []));
      const statuses = await checkWaivers(contact?.email ?? "", participants);
      for (const s of statuses) signed.set(s.participantId, s.signed);
    })
  );
  return signed;
}
