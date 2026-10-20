// GET /api/admin/private-bookings/members?q= — find the host account for a
// manual private booking, by account holder name, participant name, email or
// phone (shared matcher: lib/member-search.ts).
//
// Admin-gated: the service client bypasses RLS, so this check is the only
// thing between a query string and every member's name. Returns names and ids
// only — no dates of birth, contact details or medical notes.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { searchMembers } from "@/lib/member-search";

type Result = {
  account_id: string;
  account_name: string;
  participants: { id: string; name: string }[];
};

export async function GET(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ results: [] });

  let members;
  try {
    ({ members } = await searchMembers(query));
  } catch (error) {
    console.error("private member search failed", error);
    return NextResponse.json({ error: "Search failed — try again." }, { status: 500 });
  }

  const results: Result[] = members.map((m) => ({
    account_id: m.id,
    account_name: m.name,
    participants: m.participants,
  }));
  return NextResponse.json({ results });
}
