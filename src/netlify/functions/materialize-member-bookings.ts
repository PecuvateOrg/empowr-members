// Daily member-booking reconciliation â€” Phase 2 Step 4 safety net.
//
// The Stripe webhook already reconciles a participant's Â£0 booking rows the
// moment their own membership changes (see app/api/webhooks/stripe/route.ts).
// This catches the case that reacting to membership changes alone cannot:
// an occurrence added to a slot AFTER someone already subscribed to it. Every
// active subscriber is re-synced from scratch daily, so a missed webhook or a
// newly seeded catalogue self-heals within 24h without anyone noticing.
//
// âš ï¸ BUILDS ITS OWN SUPABASE CLIENT â€” do NOT import lib/supabase/service.ts
// here. That module carries `import "server-only"`, whose exports map sends
// any bundle without the react-server condition (i.e. this one) to a file
// that is nothing but a `throw`. Importing it would kill this function on
// its first line, every night, in a log nobody reads â€” while the Netlify
// deploy still reported the function as deployed successfully. The shared
// logic in lib/materialize-member-bookings.ts therefore takes the client as
// a parameter and carries no guard of its own.
//
// Direct call, not an HTTP hand-off to a background function (contrast
// PecuvateDashboard's nightly-inventory, which fires a background function
// because ITS work â€” 8 site audits, external credential probes â€” can exceed
// the 30s scheduled ceiling). This job is a handful of Supabase round-trips
// per subscriber against a small subscriber base; if that stops being true,
// split it the same way.
import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { reconcileAllMemberBookings } from "@/lib/materialize-member-bookings";
import { reconcileBrevo } from "@/lib/reconcile-brevo";
import { findActiveSlotAmbiguities } from "@/lib/slot-ambiguity";
import { buildStaffSlotAmbiguityAlertEmail } from "@/lib/emails/staff-slot-ambiguity-alert";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/emails/shell";
import { links } from "@/lib/links";

export default async function handler(): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // Loud and specific: a missing key here is a silent no-op otherwise, and
    // this job has no user watching it.
    console.error(
      "[materialize-member-bookings] missing Supabase env",
      JSON.stringify({ url: Boolean(url), serviceKey: Boolean(serviceKey) })
    );
    return new Response(null, { status: 500 });
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const results = await reconcileAllMemberBookings(service);
    const brevo = await reconcileBrevo(service, { removeStale: true });
    const created = results.reduce((sum, r) => sum + r.created, 0);
    const cancelled = results.reduce((sum, r) => sum + r.cancelled, 0);
    const ambiguities = await reportSlotAmbiguities(service);
    console.log(
      "[materialize-member-bookings]",
      JSON.stringify({
        participants: results.length,
        created,
        cancelled,
        brevo,
        ambiguities,
      })
    );
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[materialize-member-bookings] failed", error);
    return new Response(null, { status: 500 });
  }
}

/**
 * Alert staff if a plan's "every slot" entitlement has stopped matching the
 * single weekly session its name promises — see lib/slot-ambiguity.ts for the
 * full reasoning, and why this reports rather than fixes.
 *
 * SENDS ITS OWN EMAIL, deliberately: lib/notifications.ts and lib/email.ts
 * both carry `import "server-only"` and would kill this function on import,
 * exactly as lib/supabase/service.ts would — which is why the Supabase client
 * above is built here too. Only the transport is rebuilt; the template and the
 * sender identity come from the guard-free modules, so there is no second copy
 * of either.
 *
 * Best-effort: a failure here must never turn a successful reconciliation into
 * a failed run, so it is caught and logged rather than thrown.
 *
 * ⚠️ A FAILURE REPORTS `checked: false`, NEVER `found: 0`. Those are different
 * facts and collapsing them is the whole risk here: "nothing is wrong" and "I
 * could not look" would read identically in the run log, so a detector broken
 * on day one would sit there reassuring everyone forever. This project has
 * shipped a fail-open twice already. The read is unexercised until the first
 * scheduled run — CI never executes a Netlify function.
 */
async function reportSlotAmbiguities(
  service: Parameters<typeof findActiveSlotAmbiguities>[0]
): Promise<{ checked: boolean; found: number; alerted: boolean }> {
  try {
    const findings = await findActiveSlotAmbiguities(service);
    if (findings.length === 0) return { checked: true, found: 0, alerted: false };

    // Loud in the log whether or not the email gets out — the log is the
    // fallback if Resend is misconfigured, not the primary channel.
    console.error(
      "[materialize-member-bookings] SLOT AMBIGUITY",
      JSON.stringify(findings)
    );

    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error(
        "[materialize-member-bookings] RESEND_API_KEY not set — slot ambiguity alert not sent"
      );
      return { checked: true, found: findings.length, alerted: false };
    }

    const { subject, html } = buildStaffSlotAmbiguityAlertEmail({ findings });
    const { error } = await new Resend(key).emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: links.staffBookingAlerts,
      subject,
      html,
    });
    if (error) {
      console.error(
        "[materialize-member-bookings] slot ambiguity alert send failed",
        error
      );
      return { checked: true, found: findings.length, alerted: false };
    }
    return { checked: true, found: findings.length, alerted: true };
  } catch (error) {
    console.error(
      "[materialize-member-bookings] SLOT AMBIGUITY CHECK DID NOT RUN",
      error
    );
    return { checked: false, found: 0, alerted: false };
  }
}

export const config: Config = {
  // 03:15 UTC â€” after PecuvateDashboard's 03:00 nightly-inventory and any
  // evening deploy has settled, before the working day.
  schedule: "15 3 * * *",
};

