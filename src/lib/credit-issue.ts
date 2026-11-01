// Issuing credit and reading a member's credit records: shared by the credit notes screen
// (/api/admin/credits) and the AI tools (lib/mcp/tools.ts), so both apply the same rules.
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { creditExpiry } from "@/lib/credits";

// Three kinds of credit (owner, 2026-09-28). The database decides the same
// way from what is supplied; `kind` makes the form's choice explicit so a
// general credit can never carry stray old-platform fields, or the reverse.
export const creditFields = z.object({
  kind: z.enum(["general", "booking", "legacy"]),
  account_id: z.string().uuid(),
  booking_id: z.string().uuid().optional(), amount_pence: z.number().int().positive().max(1000000).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  reference: z.string().trim().min(1).max(100).optional(),
  session: z.string().trim().min(1).max(200).optional(),
  session_date: z.iso.date().optional(), reason: z.string().trim().min(1).max(1000),
});

type CreditFields = z.infer<typeof creditFields>;

export function creditFieldsProblem(v: CreditFields): string | null {
  if (v.kind === "booking" && !v.booking_id) return "Choose the booking to cancel and credit.";
  if (v.kind === "general" && !v.amount_pence) return "Enter the credit amount.";
  if (v.kind === "legacy" && !(v.amount_pence && v.platform && v.reference && v.session && v.session_date)) {
    return "Enter the original platform, booking reference, session, date and amount.";
  }
  return null;
}

export type IssueResult = { ok: true; credit: unknown } | { ok: false; error: string };

/** `requestId` makes a retry issue once. */
export async function issueCredit(v: CreditFields, requestId: string, staffId: string): Promise<IssueResult> {
  const legacy = v.kind === "legacy";
  // A general credit's optional reference (a Stripe payment, an email) is kept
  // with the reason. It is not an old-platform reference, so it must not enter
  // that duplicate check.
  const reason = v.kind === "general" && v.reference ? `${v.reason} (ref: ${v.reference})` : v.reason;
  const { data, error } = await createServiceClient().rpc("mem_issue_credit", {
    p_account_id: v.account_id, p_request_id: requestId, p_staff_id: staffId,
    p_booking_id: v.kind === "booking" ? v.booking_id! : null,
    p_amount: v.kind === "booking" ? null : v.amount_pence!,
    p_platform: legacy ? v.platform! : null, p_reference: legacy ? v.reference! : null,
    p_session: legacy ? v.session! : null, p_session_date: legacy ? v.session_date! : null,
    p_reason: reason, p_expires_at: creditExpiry(),
  });
  if (error) {
    console.error("Issue credit failed", error);
    return { ok: false, error: error.code === "23505"
      ? "Credit has already been issued for this booking or external reference. Check the member’s credit history."
      : "Credit could not be issued. Check the member and booking, then retry." };
  }
  return { ok: true, credit: data };
}

/** Paid confirmed bookings (creditable), credit with staff reasons, and refunds still pending. Throws on
 *  a failed read. */
export async function memberCreditRecords(accountId: string) {
  const db = createServiceClient();
  const [bookings, credits, refunds, reasons] = await Promise.all([
    db.from("mem_bookings").select("id,status,price_paid_pence,created_at,participant:mem_participants(name),occurrence:mem_occurrences(starts_at,offering:mem_offerings(title)),course_run:mem_course_runs(label,offering:mem_offerings(title))")
      .eq("account_id", accountId).eq("status", "confirmed").gt("price_paid_pence", 0).order("created_at", { ascending: false }).limit(100),
    db.from("mem_credit_balances").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
    db.from("mem_booking_refunds").select("booking_id,card_pence,credit_pence,created_at").eq("account_id", accountId).eq("completed", false),
    // Staff reasons are internal, so they are not in mem_credit_balances
    // (which members read) and are fetched here for the admin view only.
    db.from("mem_credits").select("id,reason").eq("account_id", accountId),
  ]);
  if (bookings.error || credits.error || refunds.error || reasons.error) throw new Error("Could not load member records.");
  const reasonById = new Map((reasons.data ?? []).map(r => [r.id, r.reason as string | null]));
  return { bookings: bookings.data, refunds: refunds.data,
    credits: (credits.data ?? []).map(c => ({ ...c, reason: reasonById.get(c.id) ?? null })) };
}
