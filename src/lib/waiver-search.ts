// "Has this person signed?" — the admin waiver search (owner, 2026-10-10).
//
// Two sources, and both use the booking gate's own definition of signed so
// this page can never call a child covered when booking or the door would
// turn them away:
//   1. Skaters on a Members account, matched by name and resolved with
//      checkWaivers() itself (consent row, else the active-form fallback).
//   2. Signatures on the standalone waiver.empowrcic.org app, for people
//      with no Members account yet — e.g. a party guest who signed but has
//      not joined. Only responses on the ACTIVE form version within
//      WAIVER_VALIDITY_YEARS count, the same window checkWaivers applies.
//
// Read-only: unlike the booking routes, a fallback match found here is not
// persisted back as a consent row.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWaivers, WAIVER_VALIDITY_YEARS } from "@/lib/waivers";
import { accountContact } from "@/lib/notifications";

export type WaiverSearchResult = {
  key: string;
  source: "member" | "waiver_site";
  skaterName: string;
  /** Account holder (member) or the person who signed (waiver site). */
  contactName: string | null;
  contactEmail: string | null;
  signed: boolean;
  signedAt: string | null;
};

// ilike treats % and _ as wildcards; a search for "a_b" must mean that text.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Throws on a failed read: an empty result must mean "nobody matched",
 *  never "the database did not answer". */
export async function searchWaivers(q: string): Promise<WaiverSearchResult[]> {
  const service = createServiceClient();
  const needle = norm(q);

  // 1. Members skaters by name.
  const { data: participants, error: pError } = await service
    .from("mem_participants")
    .select("id, name, person_id, account_id")
    .ilike("name", `%${escapeLike(q.trim())}%`)
    .limit(25);
  if (pError) throw new Error(`waiver search: participants read failed: ${pError.message}`);

  const byAccount = new Map<string, NonNullable<typeof participants>>();
  for (const p of participants ?? []) {
    const list = byAccount.get(p.account_id) ?? [];
    list.push(p);
    byAccount.set(p.account_id, list);
  }
  const memberResults = (
    await Promise.all(
      [...byAccount.entries()].map(async ([accountId, list]) => {
        const contact = await accountContact(service, accountId);
        const statuses = await checkWaivers(contact?.email ?? "", list);
        const signed = new Map(statuses.map((s) => [s.participantId, s.signed]));
        return list.map<WaiverSearchResult>((p) => ({
          key: `m:${p.id}`,
          source: "member",
          skaterName: p.name,
          contactName: contact?.name ?? null,
          contactEmail: contact?.email ?? null,
          signed: signed.get(p.id) ?? false,
          signedAt: null,
        }));
      })
    )
  ).flat();

  // 2. Valid signatures on the waiver site. The valid set is small (one
  // year, one form version), so it is read whole and matched here: the
  // skater names are a text[] PostgREST cannot ilike.
  const { data: version, error: vError } = await service
    .from("form_versions")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (vError) throw new Error(`waiver search: form_versions read failed: ${vError.message}`);

  const siteResults: WaiverSearchResult[] = [];
  if (version) {
    const from = new Date();
    from.setFullYear(from.getFullYear() - WAIVER_VALIDITY_YEARS);
    const { data: responses, error: rError } = await service
      .from("waiver_responses")
      .select("id, skater_names, submitted_at, person:people(first_name, last_name, email)")
      .eq("form_version_id", version.id)
      .gte("submitted_at", from.toISOString())
      .order("submitted_at", { ascending: false });
    if (rError) throw new Error(`waiver search: responses read failed: ${rError.message}`);

    for (const r of responses ?? []) {
      const person = r.person as unknown as { first_name: string; last_name: string; email: string } | null;
      const signer = person ? `${person.first_name} ${person.last_name}`.trim() : "";
      const signerHit =
        norm(signer).includes(needle) || (person?.email ?? "").toLowerCase().includes(needle);
      // No skater names = the signer is the skater.
      const skaters = (r.skater_names as string[] | null)?.filter(Boolean).length
        ? (r.skater_names as string[])
        : [signer];
      for (const name of skaters) {
        if (!signerHit && !norm(name).includes(needle)) continue;
        siteResults.push({
          key: `w:${r.id}:${name}`,
          source: "waiver_site",
          skaterName: name.trim(),
          contactName: signer || null,
          contactEmail: person?.email ?? null,
          signed: true,
          signedAt: r.submitted_at,
        });
      }
    }
  }

  return [...memberResults, ...siteResults.slice(0, 50)];
}
