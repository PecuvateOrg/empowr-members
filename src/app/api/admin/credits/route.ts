import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { creditExpiry } from "@/lib/credits";

// Three kinds of credit (owner, 2026-09-28). The database decides the same
// way from what is supplied; `kind` makes the form's choice explicit so a
// general credit can never carry stray old-platform fields, or the reverse.
const schema = z.object({
  kind: z.enum(["general", "booking", "legacy"]),
  account_id: z.string().uuid(), request_id: z.string().uuid(),
  booking_id: z.string().uuid().optional(), amount_pence: z.number().int().positive().max(1000000).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  reference: z.string().trim().min(1).max(100).optional(),
  session: z.string().trim().min(1).max(200).optional(),
  session_date: z.iso.date().optional(), reason: z.string().trim().min(1).max(1000),
  verified: z.literal(true), agreed: z.literal(true),
}).refine(v => v.kind !== "booking" || v.booking_id, "Choose the booking to cancel and credit.")
  .refine(v => v.kind !== "general" || v.amount_pence, "Enter the credit amount.")
  .refine(v => v.kind !== "legacy" || (v.amount_pence && v.platform && v.reference && v.session && v.session_date),
    "Enter the original platform, booking reference, session, date and amount.");

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const v = parsed.data;
  const legacy = v.kind === "legacy";
  // A general credit's optional reference (a Stripe payment, an email) is kept
  // with the reason. It is not an old-platform reference, so it must not enter
  // that duplicate check.
  const reason = v.kind === "general" && v.reference ? `${v.reason} (ref: ${v.reference})` : v.reason;
  const { data, error } = await createServiceClient().rpc("mem_issue_credit", {
    p_account_id: v.account_id, p_request_id: v.request_id, p_staff_id: admin.id,
    p_booking_id: v.kind === "booking" ? v.booking_id! : null,
    p_amount: v.kind === "booking" ? null : v.amount_pence!,
    p_platform: legacy ? v.platform! : null, p_reference: legacy ? v.reference! : null,
    p_session: legacy ? v.session! : null, p_session_date: legacy ? v.session_date! : null,
    p_reason: reason, p_expires_at: creditExpiry(),
  });
  if (error) {
    console.error("Issue credit failed", error);
    return NextResponse.json({ error: error.code === "23505"
      ? "Credit has already been issued for this booking or external reference. Check the member’s credit history."
      : "Credit could not be issued. Check the member and booking, then retry." }, { status: 409 });
  }
  return NextResponse.json({ credit: data }, { status: 201 });
}

export async function GET(request: Request) {
  if (!await getAuthedAdmin()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const db = createServiceClient();
  const accountId = params.get("account_id");
  if (accountId) {
    if (!z.string().uuid().safeParse(accountId).success) return NextResponse.json({ error: "Invalid member" }, { status: 400 });
    const [bookings, credits, refunds, reasons] = await Promise.all([
      db.from("mem_bookings").select("id,status,price_paid_pence,created_at,participant:mem_participants(name),occurrence:mem_occurrences(starts_at,offering:mem_offerings(title)),course_run:mem_course_runs(label,offering:mem_offerings(title))")
        .eq("account_id", accountId).eq("status", "confirmed").gt("price_paid_pence", 0).order("created_at", { ascending: false }).limit(100),
      db.from("mem_credit_balances").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
      db.from("mem_booking_refunds").select("booking_id,card_pence,credit_pence,created_at").eq("account_id", accountId).eq("completed", false),
      // Staff reasons are internal, so they are not in mem_credit_balances
      // (which members read) and are fetched here for the admin view only.
      db.from("mem_credits").select("id,reason").eq("account_id", accountId),
    ]);
    if (bookings.error || credits.error || refunds.error || reasons.error) return NextResponse.json({ error: "Could not load member records." }, { status: 500 });
    const reasonById = new Map((reasons.data ?? []).map(r => [r.id, r.reason as string | null]));
    return NextResponse.json({ bookings: bookings.data, refunds: refunds.data,
      credits: (credits.data ?? []).map(c => ({ ...c, reason: reasonById.get(c.id) ?? null })) });
  }
  const query = (params.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) return NextResponse.json({ members: [] });
  const safe = query.replace(/[%_\\]/g, "");
  const { data, error } = await db.from("mem_accounts").select("id,name,phone")
    .ilike("name", `%${safe}%`).order("name").limit(20);
  if (error) return NextResponse.json({ error: "Member search failed." }, { status: 500 });
  return NextResponse.json({ members: data });
}
