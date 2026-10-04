import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

// Archived waivers of people removed from a household (owner, 2026-10-04).
// Team-only and opened on request, so: admins only, a search is required (no
// browsing the whole archive), and every record returned is logged with who
// looked and what they searched for. The table has no API-role grants at all;
// this route, through the service client, is the only way in.

const COLUMNS =
  "id, skater_name, signer_name, signer_email, has_minors, agreed_tc, agreed_waiver, agreed_photo, form_version_id, signed_at, archived_at, purge_after";

// ilike treats % and _ as wildcards; a search for "a_b" must mean that text.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ error: "Enter at least 3 characters of a name or email." }, { status: 400 });
  }

  const service = createServiceClient();
  const pattern = `%${escapeLike(q)}%`;
  // Two queries rather than .or(): a comma or bracket in the search text
  // would otherwise be read as filter syntax.
  const [byName, byEmail] = await Promise.all([
    service.from("mem_waiver_archive").select(COLUMNS).ilike("skater_name", pattern).limit(50),
    service.from("mem_waiver_archive").select(COLUMNS).ilike("signer_email", pattern).limit(50),
  ]);
  const error = byName.error ?? byEmail.error;
  if (error) {
    console.error("waiver archive search failed", error);
    return NextResponse.json({ error: "Could not search the archive — please try again." }, { status: 500 });
  }

  const rows = new Map<string, NonNullable<typeof byName.data>[number]>();
  for (const row of [...(byName.data ?? []), ...(byEmail.data ?? [])]) rows.set(row.id, row);
  const results = [...rows.values()].sort((a, b) => (a.archived_at < b.archived_at ? 1 : -1));

  // Log before returning. If the log cannot be written, nothing is shown:
  // an unrecorded look at the archive is the thing this exists to prevent.
  if (results.length > 0) {
    const { error: logError } = await service.from("mem_waiver_archive_access").insert(
      results.map((r) => ({ archive_id: r.id, viewed_by: admin.email ?? admin.id, query: q }))
    );
    if (logError) {
      console.error("waiver archive access log failed", logError);
      return NextResponse.json({ error: "Could not record this look-up, so nothing is shown. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ results });
}
