import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { AuthedAccount } from "@/lib/auth";
import type { Booking } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getOrCreateStripeCustomer, stripeCustomerAccount } from "@/lib/stripe";
import { sendBookingConfirmationForSession } from "@/lib/notifications";
import { reconcileBrevo } from "@/lib/reconcile-brevo";

export async function creditCheckout(input: {
  authed: AuthedAccount; held: Booking[]; expectedCredit: number;
  origin: string; cancelPath: string; title: string; when: string;
}) {
  const db = createServiceClient();
  const token = `memcredit_${randomUUID()}`;
  const ids = input.held.map(b => b.id);
  let stripeAttempted = false;
  let confirmed = false;
  try {
    const { data, error } = await db.rpc("mem_reserve_credit", {
      p_account_id: input.authed.account.id, p_booking_ids: ids,
      p_expected: input.expectedCredit, p_token: token,
    });
    if (error) throw error;
    const held = data as Booking[];
    const due = held.reduce((n,b) => n+(b.price_paid_pence ?? 0)-b.credit_applied_pence,0);
    const credit = held.reduce((n,b) => n+b.credit_applied_pence,0);
    if (due === 0) {
      const settled = await db.rpc("mem_settle_credit_checkout", {
        p_token: token, p_account_id: input.authed.account.id, p_session_id: token,
        p_payment_intent: null, p_amount: 0, p_action: "paid",
      });
      if (settled.error) throw settled.error;
      confirmed = true;
      await sendBookingConfirmationForSession(db, token);
      try { await reconcileBrevo(db,{accountIds:[input.authed.account.id]}); }
      catch (error) { console.error("Credit booking Brevo sync failed",error); }
      return NextResponse.json({ checkout_url: `${input.origin}/book/confirmation?session_id=${token}` },{status:201});
    }
    const stripe = getStripe();
    const customer = await getOrCreateStripeCustomer(db,stripeCustomerAccount(input.authed));
    stripeAttempted = true;
    const session = await stripe.checkout.sessions.create({
      mode: "payment", customer, client_reference_id: input.authed.account.id,
      line_items: [{ quantity:1, price_data:{ currency:"gbp",unit_amount:due,
        product_data:{name:input.title,description:`${input.when} · ${held.length} place(s) · £${(credit/100).toFixed(2)} member credit applied`}} }],
      metadata: { app:"members",credit_checkout_token:token,account_id:input.authed.account.id },
      payment_intent_data: { metadata:{app:"members",credit_checkout_token:token,account_id:input.authed.account.id} },
      expires_at:Math.floor(Date.now()/1000)+31*60,
      success_url:`${input.origin}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${input.origin}${input.cancelPath}`,
    }, {idempotencyKey:token});
    if (!session.url) throw new Error("Checkout URL missing");
    const linked = await db.from("mem_bookings").update({stripe_checkout_session_id:session.id})
      .in("id",ids).eq("status","pending_payment");
    if (linked.error) throw linked.error;
    return NextResponse.json({checkout_url:session.url},{status:201});
  } catch (error) {
    console.error("Credit checkout failed", token,error);
    // A Stripe timeout is ambiguous: its checkout may still exist. Keep
    // those holds through Stripe expiry; never make its credit spendable twice.
    if (!stripeAttempted && !confirmed) {
      const released = await db.from("mem_bookings").update({status:"cancelled",cancelled_at:new Date().toISOString()})
        .in("id",ids).eq("status","pending_payment");
      if (released.error) console.error("Credit hold release failed",released.error);
    }
    return NextResponse.json({error:stripeAttempted
      ? "Checkout could not be opened. Your place and credit may be held for up to 45 minutes; check your bookings before retrying."
      : "Credit or availability changed. Refresh the page and try again."},{status:409});
  }
}
