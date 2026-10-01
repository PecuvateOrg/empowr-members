// The 2026-10-01 emergency-contact follow-up. Until then the relationship
// list had nothing for an adult's contact (partner, grown-up child), so
// 50 of 137 waivers recorded "Other" — staff could not tell who they would be
// calling. A signed waiver is a legal record and is never edited, so the
// fix asks those members to set the relationship on their household skaters
// instead. The banner shows until every skater has one.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Names of the account's skaters still missing a relationship, if the
 * account holder ever signed a waiver recording "Other". Empty otherwise.
 *
 * Fails toward showing nothing: a read error logs and returns [], since a
 * reminder banner is not worth breaking every member page over.
 */
export async function skatersNeedingContactRelationship(account: {
  id: string;
  email: string | null;
}): Promise<string[]> {
  const email = account.email?.trim();
  if (!email) return [];
  const service = createServiceClient();

  const { data: missing, error: missingError } = await service
    .from("mem_participants")
    .select("name")
    .eq("account_id", account.id)
    .is("emergency_contact_relationship", null);
  if (missingError) {
    console.error("contact follow-up: participants read failed", account.id, missingError);
    return [];
  }
  if (!missing?.length) return [];

  const { data: signers, error: signersError } = await service
    .from("people")
    .select("id")
    .ilike("email", email);
  if (signersError) {
    console.error("contact follow-up: signers read failed", account.id, signersError);
    return [];
  }
  if (!signers?.length) return [];

  const { count, error: otherError } = await service
    .from("waiver_responses")
    .select("id", { count: "exact", head: true })
    .in("person_id", signers.map((s) => s.id))
    .eq("emergency_contact_relationship", "Other");
  if (otherError) {
    console.error("contact follow-up: waivers read failed", account.id, otherError);
    return [];
  }

  return count ? missing.map((p) => p.name as string) : [];
}
