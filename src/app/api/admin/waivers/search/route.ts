import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { searchWaivers } from "@/lib/waiver-search";

// "Has this person signed?" (owner, 2026-10-10). Any admin may search; a
// search is required (no browsing), and every search is recorded with who
// ran it before anything is returned — the waiver archive's rule, applied
// to the live waiver records.

export async function GET(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    return NextResponse.json({ error: "Enter at least 3 characters of a name or email." }, { status: 400 });
  }

  let results;
  try {
    results = await searchWaivers(q);
  } catch (err) {
    console.error("waiver search failed", err);
    return NextResponse.json({ error: "Could not search waivers — please try again." }, { status: 500 });
  }

  // Log before returning. If the log cannot be written, nothing is shown.
  const { error: logError } = await createServiceClient()
    .from("mem_waiver_search_log")
    .insert({ searched_by: admin.email ?? admin.id, query: q, result_count: results.length });
  if (logError) {
    console.error("waiver search log failed", logError);
    return NextResponse.json({ error: "Could not record this search, so nothing is shown. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ results });
}
