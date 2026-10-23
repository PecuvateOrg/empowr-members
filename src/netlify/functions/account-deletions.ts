// Nightly account deletion run (spec: planning/spec/account-deletion.md): the day-7 and day-13
// reminders, then erasure of every request whose 14 days are up, re-checking holds first.
//
// ⚠️ BUILDS ITS OWN CLIENTS — do NOT import lib/supabase/service.ts, lib/stripe.ts or lib/email.ts
// here. Each carries `import "server-only"`, which throws in this bundle (see
// materialize-member-bookings.ts and ops/scripts/verify-scheduled-function.ts).
//
// Its own function rather than a step in materialize-member-bookings: erasure makes several
// external calls per account and must never be starved of time by the booking reconcile, or eat
// into it. Runs at 03:45, after the 02:00 waiver retention job and the 03:15 reconcile.
import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { Resend } from "resend";
import { BrevoClient } from "@/lib/brevo";
import { runDueErasures, sendDeletionReminders, type Send } from "@/lib/account-deletion-core";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/emails/shell";

export default async function handler(): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !serviceKey || !resendKey) {
    console.error("[account-deletions] missing env", JSON.stringify({ url: Boolean(url), serviceKey: Boolean(serviceKey), resend: Boolean(resendKey) }));
    return new Response(null, { status: 500 });
  }
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // No Stripe key = erasure cannot check disputes or remove the customer; the core then defers
  // or fails each one rather than erasing blind.
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  const brevo = process.env.BREVO_API_KEY ? new BrevoClient(process.env.BREVO_API_KEY) : null;
  const resend = new Resend(resendKey);
  const send: Send = async (msg) => {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, replyTo: EMAIL_REPLY_TO, ...msg });
    if (error) console.error("[account-deletions] email failed", msg.subject, error);
    return !error;
  };

  try {
    const reminders = await sendDeletionReminders(service, send);
    const erasures = await runDueErasures(service, { stripe, brevo, send });
    console.log("[account-deletions]", JSON.stringify({ reminders, erasures }));
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[account-deletions] failed", error);
    return new Response(null, { status: 500 });
  }
}

export const config: Config = {
  schedule: "45 3 * * *",
};
