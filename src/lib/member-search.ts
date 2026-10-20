// Shared admin "find a member account" search (owner, 2026-10-20).
//
// Before this, the credit page matched the typed text as one chunk against
// mem_accounts.name only, so staff searching a skater's name, an email from a
// CRM message, or "Surname Firstname" found nobody — while the waiver search,
// which also reads skater names and signers, found the same person. Every
// admin screen that picks an ACCOUNT now uses this one function so the two
// cannot drift apart again.
//
// Matching: each word typed must appear somewhere in the account's haystack —
// account holder name, phone, auth email, or any of its skaters' names — in
// any order, ignoring case and accents. The member set is small (hundreds),
// so it is read whole and matched here; PostgREST cannot ilike auth emails.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type MemberSearchResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  participants: { id: string; name: string }[];
};

/** Someone who signed on waiver.empowrcic.org but has no Members account. */
export type WaiverOnlyMatch = { name: string; email: string };

export type MemberSearch = { members: MemberSearchResult[]; waiverOnly: WaiverOnlyMatch[] };

const LIMIT = 20;

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function searchTokens(q: string): string[] {
  return norm(q).split(" ").filter(Boolean);
}

const matches = (haystack: string, tokens: string[]) => tokens.every((t) => haystack.includes(t));

type Service = ReturnType<typeof createServiceClient>;

// PostgREST caps a response at 1,000 rows WITHOUT an error, so a whole-table
// read must page or it silently stops finding people past row 1,000.
async function readAll<T>(service: Service, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from(table).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`member search: ${table} read failed: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
}

async function authEmails(service: Service): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`member search: auth users read failed: ${error.message}`);
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }
  return emails;
}

/** Throws on a failed read: an empty result must mean "nobody matched",
 *  never "the database did not answer". */
export async function searchMembers(q: string): Promise<MemberSearch> {
  const tokens = searchTokens(q);
  if (tokens.join("").length < 2) return { members: [], waiverOnly: [] };
  const service = createServiceClient();

  const [accounts, participants, emails] = await Promise.all([
    readAll<{ id: string; name: string; phone: string | null; user_id: string | null }>(service, "mem_accounts", "id, name, phone, user_id"),
    readAll<{ id: string; name: string; account_id: string }>(service, "mem_participants", "id, name, account_id"),
    authEmails(service),
  ]);

  const byAccount = new Map<string, { id: string; name: string }[]>();
  for (const p of participants) {
    const list = byAccount.get(p.account_id) ?? [];
    list.push({ id: p.id, name: p.name });
    byAccount.set(p.account_id, list);
  }

  const members: MemberSearchResult[] = [];
  for (const a of accounts) {
    const email = a.user_id ? emails.get(a.user_id) ?? null : null;
    const kids = byAccount.get(a.id) ?? [];
    const haystack = norm([a.name, a.phone, email, ...kids.map((k) => k.name)].join(" "));
    if (matches(haystack, tokens)) {
      members.push({ id: a.id, name: a.name || "(no name on account)", phone: a.phone, email, participants: kids });
    }
  }
  members.sort((x, y) => x.name.localeCompare(y.name));
  if (members.length > 0) return { members: members.slice(0, LIMIT), waiverOnly: [] };

  // Nobody on Members: say so if they signed a waiver, so staff know to ask
  // them to register rather than assume the search is broken.
  const people = await readAll<{ first_name: string | null; last_name: string | null; email: string | null }>(
    service, "people", "id, first_name, last_name, email");
  const memberEmails = new Set([...emails.values()].map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const waiverOnly: WaiverOnlyMatch[] = [];
  for (const p of people) {
    const email = (p.email ?? "").trim();
    const key = email.toLowerCase();
    if (!email || memberEmails.has(key) || seen.has(key)) continue;
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    if (!matches(norm(`${name} ${email}`), tokens)) continue;
    seen.add(key);
    waiverOnly.push({ name, email });
  }
  return { members: [], waiverOnly: waiverOnly.slice(0, LIMIT) };
}
