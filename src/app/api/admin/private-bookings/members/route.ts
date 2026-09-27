// GET /api/admin/private-bookings/members?q= — find the host account for a
// manual private booking, by account holder or participant name.
//
// Admin-gated: the service client bypasses RLS, so this check is the only
// thing between a query string and every member's name. Returns names and ids
// only — no dates of birth, contact details or medical notes.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

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

  // PostgREST filter syntax treats , ( ) as structure; strip them rather than
  // let a name with a comma break or widen the filter.
  const safe = query.replace(/[,()*%\\]/g, " ").trim();
  if (safe.length < 2) return NextResponse.json({ results: [] });

  const service = createServiceClient();
  const [byAccount, byParticipant] = await Promise.all([
    service.from("mem_accounts").select("id").ilike("name", `%${safe}%`).limit(20),
    service.from("mem_participants").select("account_id").ilike("name", `%${safe}%`).limit(20),
  ]);
  if (byAccount.error || byParticipant.error) {
    console.error("private member search failed", byAccount.error ?? byParticipant.error);
    return NextResponse.json({ error: "Search failed — try again." }, { status: 500 });
  }

  const accountIds = [
    ...new Set([
      ...(byAccount.data ?? []).map((r) => r.id as string),
      ...(byParticipant.data ?? []).map((r) => r.account_id as string),
    ]),
  ].slice(0, 20);
  if (accountIds.length === 0) return NextResponse.json({ results: [] });

  const { data, error } = await service
    .from("mem_accounts")
    .select("id, name, participants:mem_participants(id, name)")
    .in("id", accountIds);
  if (error) {
    console.error("private member search read failed", error);
    return NextResponse.json({ error: "Search failed — try again." }, { status: 500 });
  }

  const results: Result[] = (data ?? []).map((a) => ({
    account_id: a.id as string,
    account_name: (a.name as string) || "(no name on account)",
    participants: ((a.participants ?? []) as { id: string; name: string }[]).map((p) => ({
      id: p.id,
      name: p.name,
    })),
  }));
  return NextResponse.json({ results });
}
