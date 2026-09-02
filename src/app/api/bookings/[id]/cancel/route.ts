// POST /api/bookings/[id]/cancel — self-serve cancellation for a
// confirmed booking, restored 2026-09-02 for Programme Policies v1.2.
//
// The policy gate (lib/cancellation.ts) is re-evaluated here and is
// authoritative — the render-time copy on /bookings is only an estimate,
// and a page left open past the 48h cutoff must not be able to cancel.
//
// The status flip is claimed atomically FIRST (confirmed -> refunded,
// guarded by .eq("status","confirmed")) and only then is Stripe called,
// so two concurrent requests cannot both refund. If the refund throws,
// the claim rolls back to confirmed so the member can retry. Do not
// reorder these: calling Stripe first re-opens the double-refund window.
//
// Refund to the original card is the ONLY outcome — see the note in
// lib/cancellation.ts on why credit is not offered.
//
// Capacity needs no work here: mem_hold_bookings() recomputes live from
// row status and excludes 'refunded', so the place frees itself.
//
// The confirmation email is best-effort and never fails the request —
// the money has already moved by then.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { evaluateCancellationPolicy } from "@/lib/cancellation";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { sendBookingCancellationEmail } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

type OfferingJoin = { title: string; refund_policy: "standard" | "non_refundable" };

type BookingRow = {
  id: string;
  status: string;
  price_paid_pence: number | null;
  stripe_payment_intent_id: string | null;
  participant: { name: string } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    offering: OfferingJoin | null;
  } | null;
  course_run: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
    offering: OfferingJoin | null;
  } | null;
};

export async function POST(_request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(
      `id, status, price_paid_pence, stripe_payment_intent_id,
       participant:mem_participants(name),
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title, refund_policy)),
       course_run:mem_course_runs(label, starts_on, ends_on, offering:mem_offerings(title, refund_policy))`
    )
    .eq("id", id)
    .eq("account_id", authed.account.id)
    .maybeSingle();

  if (error) {
    console.error("cancel: booking read failed", id, error);
    return NextResponse.json(
      { error: "Could not load this booking — please try again." },
      { status: 500 }
    );
  }
  const booking = data as unknown as BookingRow | null;
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Only confirmed bookings can be cancelled here." },
      { status: 409 }
    );
  }

  const offering = booking.occurrence?.offering ?? booking.course_run?.offering;
  const startsAt = booking.occurrence?.starts_at ?? booking.course_run?.starts_on;
  if (!offering || !startsAt) {
    console.error("cancel: booking missing offering/start", id);
    return NextResponse.json(
      { error: "Could not verify this booking's cancellation policy." },
      { status: 500 }
    );
  }

  const policy = evaluateCancellationPolicy(offering.refund_policy, startsAt);
  if (!policy.allowed) {
    return NextResponse.json({ error: policy.reason }, { status: 403 });
  }

  const amountPence = booking.price_paid_pence ?? 0;

  // Nothing to refund — refuse BEFORE claiming the status, so we never
  // write a state we then have to roll back, and so the member gets a
  // truthful message instead of "try again" on a booking that can never
  // self-cancel.
  //
  // Two ways to land here. A confirmed booking with no payment intent:
  // the webhook writes `payment_intent ?? null`, so a Checkout session
  // that returned none confirms without one. And a £0 booking: Step 4
  // will create those for subscribers, and cancelling one has to release
  // the subscription's reservation too — a flow this route knows nothing
  // about. Both are for a human until that exists.
  if (!booking.stripe_payment_intent_id || amountPence <= 0) {
    console.warn("cancel: no refundable payment on booking", id, {
      amountPence,
      hasPaymentIntent: Boolean(booking.stripe_payment_intent_id),
    });
    return NextResponse.json(
      {
        error:
          "This booking can't be cancelled online — please email enquiries@empowrcic.org and we'll sort it out.",
      },
      { status: 409 }
    );
  }

  // Atomic claim — only one concurrent request can win this update.
  const { data: claimed, error: claimError } = await service
    .from("mem_bookings")
    .update({ status: "refunded", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("cancel: claim failed", id, claimError);
    return NextResponse.json(
      { error: "Could not cancel this booking — please try again." },
      { status: 500 }
    );
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This booking was already cancelled." },
      { status: 409 }
    );
  }

  try {
    await getStripe().refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: amountPence,
      reason: "requested_by_customer",
    });
  } catch (err) {
    console.error("cancel: refund failed, rolling back", id, err);
    await service
      .from("mem_bookings")
      .update({ status: "confirmed", cancelled_at: null })
      .eq("id", id);
    return NextResponse.json(
      { error: "Could not process the refund — please try again." },
      { status: 500 }
    );
  }

  const when = booking.occurrence
    ? formatOccurrence(booking.occurrence.starts_at, booking.occurrence.ends_at)
    : booking.course_run
      ? courseRunWhen(booking.course_run)
      : "";
  if (authed.user.email) {
    await sendBookingCancellationEmail(authed.user.email, {
      offeringTitle: offering.title,
      when,
      participantNames: booking.participant ? [booking.participant.name] : [],
      amountPence,
    });
  }

  return NextResponse.json({ ok: true, status: "refunded" });
}
