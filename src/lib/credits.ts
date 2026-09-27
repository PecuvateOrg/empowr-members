import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { CREDIT_EXPIRY_MONTHS } from "@/lib/business-rules";

export function creditExpiry() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + CREDIT_EXPIRY_MONTHS);
  return date.toISOString();
}

export type CreditBalance = {
  id: string; amount_pence: number; available_pence: number; reserved_pence: number;
  expires_at: string | null; source_booking_id: string | null;
  external_platform: string | null; external_reference: string | null;
  external_session: string | null; created_at: string;
};

export async function memberCredits(accountId: string) {
  const db = await createClient();
  const { data, error } = await db.from("mem_credit_balances").select("*")
    .eq("account_id", accountId).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load session credit. Please try again.");
  const notes = (data ?? []) as CreditBalance[];
  return { notes, available: notes.reduce((n, c) => n + c.available_pence, 0) };
}

/** A durable DB claim and deterministic Stripe key make retries safe even
 * when Stripe succeeded but its response or the final DB write was lost. */
export async function refundBooking(bookingId: string, accountId: string) {
  const db = createServiceClient();
  const { data, error } = await db.rpc("mem_begin_booking_refund", {
    p_booking_id: bookingId, p_account_id: accountId,
  });
  if (error) throw error;
  const refund = data as { card_pence: number; credit_pence: number; payment_intent: string | null; completed: boolean; created_at: string };
  if (refund.completed) return { ...refund, first: false };
  if (refund.card_pence > 0) {
    // Stripe only guarantees idempotency keys for 24 hours. Beyond that,
    // staff must reconcile the original refund before attempting another.
    if (Date.now() - Date.parse(refund.created_at) > 23 * 60 * 60 * 1000) {
      throw new Error("Refund needs staff reconciliation; the safe retry window has ended.");
    }
    const result = await getStripe().refunds.create({
      payment_intent: refund.payment_intent!, amount: refund.card_pence,
      reason: "requested_by_customer",
    }, { idempotencyKey: `members-booking-refund-${bookingId}` });
    const current = result.status === "succeeded" ? result : await getStripe().refunds.retrieve(result.id);
    if (current.status !== "succeeded") throw new Error("Card refund is not completed; retry or ask staff to review.");
  }
  const finished = await db.rpc("mem_finish_booking_refund", { p_booking_id: bookingId });
  if (finished.error) throw finished.error;
  return { ...refund, first: Boolean(finished.data) };
}
