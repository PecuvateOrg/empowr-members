// The emergency-contact follow-up. Until 2026-10-01 the relationship list had nothing for an adult's
// contact (partner, grown-up child), so many waivers recorded "Other", and skaters added before the
// field existed have none at all. A signed waiver is a legal record and is never edited, so members
// set the relationship on their household skaters instead. On 2026-11-01 skaters whose own waiver
// named the same contact were filled in from it (mem_contact_relationship_backfill); the banner
// shows until every remaining skater has one. "Other: Other" says nothing, so it still counts as missing.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Names of the account's skaters still missing a useful relationship. Empty otherwise.
 *
 * Fails toward showing nothing: a read error logs and returns [], since a
 * reminder banner is not worth breaking every member page over.
 */
export async function skatersNeedingContactRelationship(account: { id: string }): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("mem_participants")
    .select("name")
    .eq("account_id", account.id)
    .or("emergency_contact_relationship.is.null,emergency_contact_relationship.eq.Other: Other");
  if (error) {
    console.error("contact follow-up: participants read failed", account.id, error);
    return [];
  }
  return (data ?? []).map((p) => p.name as string);
}
