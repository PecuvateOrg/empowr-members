// POST /api/webhooks/stripe — signature-verified, idempotent.
// checkout.session.completed â†’ confirm that session's pending holds
// (replays no-op: the status filter matches nothing the second time).
// checkout.session.expired â†’ release unpaid holds without waiting for
// the grace expiry. Non-2xx makes Stripe retry, so only transient
// (database) failures return 500; anything else is acknowledged.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import {
  sendBookingConfirmationForSession,
  sendStaffSubscriptionAlert,
  sendStaffStrandedHoldAlert,
} from "@/lib/notifications";
import {
  membersSubscriptionMeta,
  toMembershipStatus,
  currentPeriodEnd,
} from "@/lib/stripe-subscription";
import { reconcileMemberBookings } from "@/lib/materialize-member-bookings";
import { reconcileBrevo } from "@/lib/reconcile-brevo";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    const service = createServiceClient();

    if (event.type === "checkout.session.completed") {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      // The booking and walk-in routes pin ["card"], which settles
      // synchronously, so a completed-but-unpaid checkout should not be
      // reachable from this app at all. It is still acknowledged — a non-2xx
      // would make Stripe retry something we cannot act on — but it is no
      // longer SILENT.
      //
      // 🔴 THIS BRANCH USED TO RETURN HERE HAVING DONE NOTHING AT ALL, on the
      // stated assumption that "anything unpaid here would be an async method
      // we don't offer". That assumption is unverified, and if it is ever
      // wrong this is the quietest failure in the app: the stranded-hold
      // detector below lives inside the PAID path, so it never runs; no
      // `checkout.session.expired` is coming either, because the session did
      // not expire; and the hold is swept by the pg_cron fallback with nobody
      // told. Money can sit in Stripe against no booking indefinitely.
      //
      // ⚠️ IDENTIFY POSITIVELY BEFORE ALERTING. This Stripe account is SHARED
      // with Empowr Heroes and Stripe fans every event to every endpoint on
      // it. Our own booking rows carrying this checkout session id are what
      // make the event ours. No rows means it was never this app's checkout —
      // NOT that something is wrong — so that case must stay silent or the
      // inbox fills with another product's payments and stops being read.
      if (session.payment_status !== "paid") {
        const { data: ours, error: lookupError } = await service
          .from("mem_bookings")
          .select("id, status")
          .eq("stripe_checkout_session_id", session.id);
        if (lookupError) {
          console.error(
            "UNPAID CHECKOUT LOOKUP FAILED - cannot tell whether this checkout was ours",
            session.id,
            lookupError
          );
        } else if ((ours ?? []).length > 0) {
          console.error(
            "COMPLETED CHECKOUT WITH UNSETTLED PAYMENT - this booking will not confirm itself",
            session.id,
            paymentIntentId,
            ours
          );
          await sendStaffStrandedHoldAlert({
            reason: "completed_unpaid",
            checkoutSessionId: session.id,
            paymentIntentId,
            amountPence: session.amount_total ?? null,
            memberEmail: session.customer_details?.email ?? null,
            bookings: ours ?? [],
          });
        }
        return NextResponse.json({ received: true });
      }

      const { data: confirmed, error } = await service
        .from("mem_bookings")
        .update({
          status: "confirmed",
          stripe_payment_intent_id: paymentIntentId,
          expires_at: null,
        })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending_payment")
        .select("id");
      if (error) {
        console.error("webhook confirm failed", session.id, error);
        return NextResponse.json({ error: "Retry" }, { status: 500 });
      }

      if (confirmed?.length) {
        // First-time confirmation (replays return no rows) — send the
        // booking-confirmation email (with the ticket link). Failure-
        // swallowed internally and must NOT fail the webhook, or Stripe
        // would retry an already-paid, already-confirmed session.
        await sendBookingConfirmationForSession(service, session.id);
        // Best-effort: communications must never turn a successful payment
        // into a failed Stripe webhook. The nightly sweep retries it.
        try {
          const accountId = session.metadata?.account_id;
          if (accountId) await reconcileBrevo(service, { accountIds: [accountId] });
        } catch (error) {
          console.error("[webhook] Brevo booking sync failed", session.id, error);
        }
      } else {
        // Replay (already confirmed) is fine; paid-for-released-holds is
        // not — surface it loudly for a manual refund until Step 7 tooling.
        // ⚠️ This read IS the detector. Dropping `error` made a failed
        // query indistinguishable from "nothing stranded": rows would be
        // null, stranded would be empty, and a member who paid for holds
        // that had already been released would never be found or refunded.
        // The webhook still must not fail — Stripe would retry an
        // already-paid session — so this logs at the same volume as a real
        // finding rather than throwing.
        const { data: rows, error: strandedError } = await service
          .from("mem_bookings")
          .select("id, status")
          .eq("stripe_checkout_session_id", session.id);
        if (strandedError) {
          console.error(
            "STRANDED-HOLD CHECK FAILED — a paid checkout may need a manual refund",
            session.id,
            paymentIntentId,
            strandedError
          );
          // We cannot tell whether this member holds a booking, and money has
          // already moved. The alert deliberately carries no looked-up
          // detail: the database is what just failed, so anything requiring a
          // second read would fail with it. Everything below comes off the
          // Stripe session we already hold.
          await sendStaffStrandedHoldAlert({
            reason: "check_failed",
            checkoutSessionId: session.id,
            paymentIntentId,
            amountPence: session.amount_total ?? null,
            memberEmail: session.customer_details?.email ?? null,
            bookings: [],
          });
        }
        // ⚠️ `else if`, NOT a second `if`. Today a PostgREST error always
        // comes back with `data: null`, so a failed check could not also
        // report released holds — but that is an assumption about the client,
        // not a guarantee, and this estate has been caught by exactly that
        // shape of reasoning before. If a partial read ever returned rows
        // AND an error, two alerts would go out for one checkout giving staff
        // two different instructions. "We could not check" is the honest
        // message when the check failed, so it wins outright.
        const stranded = (rows ?? []).filter((r) => r.status !== "confirmed");
        if (!strandedError && stranded.length > 0) {
          console.error(
            "PAID CHECKOUT FOR RELEASED HOLDS — refund needed",
            session.id,
            paymentIntentId,
            stranded
          );
          // 🔑 THE LOG ABOVE IS THE RECORD; THIS IS THE NOTIFICATION. Until
          // 2026-09-18 only the log existed, in a Netlify function log that is
          // live-only and unread, so the one time this fired in production the
          // member found out before Empowr did. Do not remove the email on the
          // grounds that the condition is already logged — that WAS the bug.
          await sendStaffStrandedHoldAlert({
            reason: "paid_holds_released",
            checkoutSessionId: session.id,
            paymentIntentId,
            amountPence: session.amount_total ?? null,
            memberEmail: session.customer_details?.email ?? null,
            bookings: stranded,
          });
        }
      }
    } else {
      const { error } = await service
        .from("mem_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("stripe_checkout_session_id", session.id)
        .eq("status", "pending_payment");
      if (error) {
        console.error("webhook release failed", session.id, error);
        return NextResponse.json({ error: "Retry" }, { status: 500 });
      }
    }
  }

  // Subscription lifecycle (Phase 2 Step 3).
  //
  // OWNERSHIP FIRST. This Stripe account is shared with Empowr Heroes and
  // Stripe delivers every subscribed event type to every endpoint on the
  // account — an event arriving here is only "some event on the Empowr CIC
  // account" until proven otherwise. Heroes' donations are subscriptions too.
  // membersSubscriptionMeta() is a positive check against metadata this app
  // stamps itself; anything unrecognised is ignored, never assumed to be ours.
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    const meta = membersSubscriptionMeta(subscription);
    if (!meta) {
      console.log(
        `[webhook] Ignoring ${event.type} ${subscription.id} — not a Members subscription`
      );
      return NextResponse.json({ received: true });
    }

    const service = createServiceClient();
    const status =
      event.type === "customer.subscription.deleted"
        ? "cancelled"
        : toMembershipStatus(subscription.status);

    // Resolved BEFORE the upsert, and only for `created` — this is what
    // distinguishes a genuine first-time subscribe (worth a staff alert)
    // from a webhook retry/replay of the same `created` event, which the
    // upsert below would otherwise treat identically (upsert doesn't say
    // whether it inserted or updated). `updated`/`deleted` always reference
    // a row that must already exist, so there is nothing to check there.
    const isNewSubscription =
      event.type === "customer.subscription.created" &&
      (
        await service
          .from("mem_memberships")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle()
      ).data === null;

    // Upsert on the Stripe subscription id: `created` inserts, later events
    // update the same row, and a replay is a no-op rather than a duplicate.
    // Keyed on stripe_subscription_id rather than (account, plan) so a member
    // who cancels and later resubscribes gets a new row instead of silently
    // reviving the old one.
    const { error } = await service.from("mem_memberships").upsert(
      {
        account_id: meta.accountId,
        participant_id: meta.participantId,
        plan_id: meta.planId,
        stripe_subscription_id: subscription.id,
        status,
        current_period_end: currentPeriodEnd(subscription),
        // The portal cancels at period end, so a cancellation arrives as
        // `updated` with the status still `active`. Without this the app
        // cannot tell a member their cancellation registered. Read on every
        // event, so un-cancelling in the portal clears it again.
        cancel_at_period_end: subscription.cancel_at_period_end === true,
      },
      { onConflict: "stripe_subscription_id" }
    );
    if (error) {
      console.error("[webhook] membership sync failed", subscription.id, error);
      return NextResponse.json({ error: "Retry" }, { status: 500 });
    }
    console.log(
      `[webhook] Membership ${subscription.id} â†’ ${status} (account ${meta.accountId})`
    );

    // Staff alert — one per genuine new subscribe, never on a replay.
    // Best-effort, same reasoning as the booking one: an internal
    // notification failing must never look like a failed subscription.
    if (isNewSubscription) {
      await sendStaffSubscriptionAlert(service, meta);
    }

    // Phase 2 Step 4 — sync this participant's Â£0 booking rows to their
    // now-current set of active memberships (creates on a fresh subscribe,
    // cancels forward on cancel/past_due). Best-effort: the membership
    // status write above is the part Stripe retries on failure, and the
    // daily reconciliation sweep is the safety net if this throws.
    try {
      await reconcileMemberBookings(service, meta.participantId);
    } catch (error) {
      console.error(
        "[webhook] member booking reconciliation failed",
        subscription.id,
        error
      );
    }
    try {
      await reconcileBrevo(service, { accountIds: [meta.accountId] });
    } catch (error) {
      console.error("[webhook] Brevo membership sync failed", subscription.id, error);
    }
  }

  return NextResponse.json({ received: true });
}

