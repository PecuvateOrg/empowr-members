// POST /api/bookings/[id]/cancel — self-serve cancellation for a
// confirmed booking, restored 2026-09-02 for Programme Policies v1.2.
//
// The policy gate (lib/cancellation.ts) is re-evaluated here and is
// authoritative — the render-time copy on /bookings is only an estimate,
// and a page left open past the 48h cutoff must not be able to cancel.
//
// THE MONEY IS SPLIT, AND THAT IS WHY THIS ROUTE NO LONGER CALLS STRIPE.
// A booking can be paid partly from credit notes, so `price_paid_pence` is
// the PRICE, not the money taken by card. Refunding it would hand credit
// back as card cash. `refundBooking()` (lib/credits.ts) takes the split from
// the database instead: `mem_begin_booking_refund` computes
// card_pence = price_paid_pence - credit_applied_pence under a row lock and
// records both figures on mem_booking_refunds. Never recompute it here.
//
// THE CLAIM IS DURABLE AND IS NOT ROLLED BACK. mem_begin_booking_refund
// parks the booking in `cancelled` and leaves it there until Stripe has
// accepted the card refund; mem_finish_booking_refund then moves it to
// `refunded`, and it is that status whose trigger releases the credit back
// to the member. An ambiguous Stripe timeout must not undo the claim — the
// retry re-uses the same Stripe idempotency key. So a second attempt
// legitimately arrives on a booking that is no longer `confirmed` and may by
// then be inside the 48h cutoff, which is why both refusals look for an
// existing claim before turning the member away.
//
// Capacity needs no work here: mem_hold_bookings() recomputes live from
// row status, so the place frees itself as soon as the claim lands.
//
// The confirmation email is best-effort and never fails the request — the
// money has already moved by then — and is gated on `first` so a retry does
// not email the member a second time.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { refundBooking } from "@/lib/credits";
import { evaluateCancellationPolicy } from "@/lib/cancellation";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { sendBookingCancellationEmail, sendStaffRefundAlert } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

type OfferingJoin = { title: string; refund_policy: "standard" | "non_refundable" };

type BookingRow = {
  id: string;
  status: string;
  price_paid_pence: number | null;
  credit_applied_pence: number | null;
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
    starts_at_local: string | null;
    ends_at_local: string | null;
    offering: OfferingJoin | null;
  } | null;
};

export async function POST(_request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  const accountId = authed.account.id;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(
      `id, status, price_paid_pence, credit_applied_pence, stripe_payment_intent_id,
       participant:mem_participants(name),
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title, refund_policy)),
       course_run:mem_course_runs(label, starts_on, ends_on, starts_at_local, ends_at_local, offering:mem_offerings(title, refund_policy))`
    )
    .eq("id", id)
    .eq("account_id", accountId)
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

  // Is a refund already claimed for this booking? Only asked when we would
  // otherwise refuse, so the ordinary cancellation still costs one query.
  //
  // `null` means the lookup itself failed and is NOT the same as "no claim":
  // treating a failed read as "no claim" would refuse a legitimate retry with
  // a policy message, hiding a broken query behind a plausible-looking answer.
  async function refundClaimed(): Promise<boolean | null> {
    const { data: claim, error: claimReadError } = await service
      .from("mem_booking_refunds")
      .select("booking_id")
      .eq("booking_id", id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (claimReadError) {
      console.error("cancel: refund claim read failed", id, claimReadError);
      return null;
    }
    return Boolean(claim);
  }

  if (booking.status !== "confirmed") {
    const claimed = await refundClaimed();
    if (claimed === null) {
      return NextResponse.json(
        { error: "Could not load this booking — please try again." },
        { status: 500 }
      );
    }
    if (!claimed) {
      return NextResponse.json(
        { error: "Only confirmed bookings can be cancelled here." },
        { status: 409 }
      );
    }
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
    // A refund already in flight is finished, not re-judged. The cutoff was
    // met when the claim was made; a retry minutes later must not be refused
    // for being late, or the member is left cancelled with no money back.
    const claimed = await refundClaimed();
    if (claimed === null) {
      return NextResponse.json(
        { error: "Could not load this booking — please try again." },
        { status: 500 }
      );
    }
    if (!claimed) {
      return NextResponse.json({ error: policy.reason }, { status: 403 });
    }
  }

  // Nothing to give back — refuse BEFORE any claim is made, so we never write
  // a state we then have to unpick, and so the member gets a truthful message
  // instead of "retry" on a booking that can never self-cancel.
  //
  // These two conditions mirror mem_begin_booking_refund's own
  // `mem_booking_not_refundable` and `mem_payment_missing` guards. They are
  // duplicated here ONLY to turn them into something a member can act on;
  // the database remains authoritative. A FULL-CREDIT booking has no payment
  // intent and no card portion and MUST still be cancellable — its refund is
  // credit going back to the balance — so the payment-intent check is gated
  // on there being card money at stake, not on credit being absent.
  //
  // Two ways to reach the payment-intent branch. A confirmed booking with no
  // payment intent: the webhook writes `payment_intent ?? null`, so a Checkout
  // session that returned none confirms without one. And a £0 booking: Step 4
  // will create those for subscribers, and cancelling one has to release the
  // subscription's reservation too — a flow this route knows nothing about.
  // Both are for a human until that exists.
  const pricePence = booking.price_paid_pence ?? 0;
  const creditPence = booking.credit_applied_pence ?? 0;
  const cardPence = pricePence - creditPence;
  if (pricePence <= 0 || (cardPence > 0 && !booking.stripe_payment_intent_id)) {
    console.warn("cancel: nothing refundable on booking", id, {
      pricePence,
      creditPence,
      cardPence,
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

  let result;
  try {
    result = await refundBooking(id, accountId);
  } catch (err) {
    // Deliberately 503 and deliberately NOT rolled back: the claim may already
    // exist, and the same idempotency key makes a retry safe rather than a
    // second refund. Staff can finish it from the refund record.
    console.error("cancel: refund could not be completed", id, err);
    // The log is the record; this is the notification (owner, 2026-09-28).
    // Never throws, so the member still gets the 503 below.
    await sendStaffRefundAlert({
      reason: "not_accepted",
      bookingId: id,
      memberEmail: authed.user.email ?? null,
      cardPence: null,
      paymentIntentId: null,
      refundId: null,
      detail: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          "We couldn't finish the refund just yet. Try again, or contact us and we'll complete it — you won't be refunded twice.",
      },
      { status: 503 }
    );
  }

  const when = booking.occurrence
    ? formatOccurrence(booking.occurrence.starts_at, booking.occurrence.ends_at)
    : booking.course_run
      ? courseRunWhen(booking.course_run)
      : "";
  if (authed.user.email && result.first) {
    await sendBookingCancellationEmail(authed.user.email, {
      offeringTitle: offering.title,
      when,
      participantNames: booking.participant ? [booking.participant.name] : [],
      // The money as it actually moved, from the database's split — not
      // price_paid_pence, which would overstate the card refund by the
      // credit portion.
      amountPence: result.card_pence,
      creditPence: result.credit_pence,
    });
  }

  return NextResponse.json({ ok: true, status: "refunded" });
}
