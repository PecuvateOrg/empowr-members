// Daily member-booking reconciliation — Phase 2 Step 4 safety net.
//
// The Stripe webhook already reconciles a participant's £0 booking rows the
// moment their own membership changes (see app/api/webhooks/stripe/route.ts).
// This catches the case that reacting to membership changes alone cannot:
// an occurrence added to a slot AFTER someone already subscribed to it. Every
// active subscriber is re-synced from scratch daily, so a missed webhook or a
// newly seeded catalogue self-heals within 24h without anyone noticing.
//
// Direct call, not an HTTP hand-off to a background function (contrast
// PecuvateDashboard's nightly-inventory, which fires a background function
// because ITS work — 8 site audits, external credential probes — can exceed
// the 30s scheduled ceiling). This job is a handful of Supabase round-trips
// per subscriber against a small subscriber base; if that stops being true,
// split it the same way.
import type { Config } from "@netlify/functions";
import { reconcileAllMemberBookings } from "@/lib/materialize-member-bookings";

export default async function handler(): Promise<Response> {
  try {
    const results = await reconcileAllMemberBookings();
    const created = results.reduce((sum, r) => sum + r.created, 0);
    const cancelled = results.reduce((sum, r) => sum + r.cancelled, 0);
    console.log(
      "[materialize-member-bookings]",
      JSON.stringify({ participants: results.length, created, cancelled })
    );
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[materialize-member-bookings] failed", error);
    return new Response(null, { status: 500 });
  }
}

export const config: Config = {
  // 03:15 UTC — after PecuvateDashboard's 03:00 nightly-inventory and any
  // evening deploy has settled, before the working day.
  schedule: "15 3 * * *",
};
