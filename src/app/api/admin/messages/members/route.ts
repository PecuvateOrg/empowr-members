import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { searchMembers } from "@/lib/member-search";

// Admin-only: find the one account to message (the shared member search, lib/member-search.ts).
// Coaches never reach an account audience, so they never need this.
export async function GET(request: Request) {
  if (!(await getAuthedAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) return NextResponse.json({ members: [], waiverOnly: [] });
  try {
    return NextResponse.json(await searchMembers(query));
  } catch (error) {
    console.error("message member search failed", error);
    return NextResponse.json({ error: "Member search failed." }, { status: 500 });
  }
}
