// GET  /api/bookings/[id]/transfer — the dates this booking can move to
// POST /api/bookings/[id]/transfer — move it (Programme Policies v1.2 §5)
//
// Built 2026-09-17. v1.2 has promised a one-time date move since 2026-09-02
// while nothing implemented it; this is that feature.
//
// NO MONEY MOVES HERE, and that is why this route is so much shorter than its
// cancel sibling. Decision #3 restricts a transfer to another date of the
// SAME offering, so the price, the age bounds and the waiver are identical
// and there is no delta to charge or refund — no Stripe call, and none of the
// atomic-claim-then-roll-back dance the cancel route needs.
//
// The gates run in the same order as the cancel route's, for the same reason:
// ownership first, then policy, then the database.
//   1. getAuthedAccount()       — is this the member's booking at all
//   2. evaluateTransferPolicy() — transferable / scope / one-move / 48h
//   3. mem_transfer_booking()   — capacity and the one-move rule AGAIN, under
//                                 a lock, because those two are races
//
// Step 2 is deliberately not trusted as the last word: a page left open past
// the cutoff and two tabs submitting at once are both ordinary. The RPC
// re-checks whatever a race can change. The migration header explains the
// split between what is checked here and what is checked in SQL.
//
// ⚠️ DEPARTURE CONSENT DOES NOT MOVE WITH THE BOOKING, and this route does
// not try to move it. departure_consents rows are keyed on session_date, and
// the register reads them narrowed to the date being run (lib/admin-data.ts,
// `.eq("session_date", localDateOf(startsAt))`), so a consent given for the
// old date is invisible on the new one and the door falls back to "collected
// in person" — the safe default, by construction. Deleting the old row would
// be the riskier act: the child may hold a second booking on that same date,
// and the row is a record of what a parent actually agreed to. What the
// member gets instead is a plain statement, in the response and in the email,
// that the arrangement has to be given again. Do not "tidy" this by carrying
// the consent across — that fabricates a parent's answer for a date they
// never saw.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { evaluateTransferPolicy } from "@/lib/transfer";
import { TRANSFER_CUTOFF_HOURS } from "@/lib/business-rules";
import { loadTransferBooking, listTransferTargets } from "@/lib/booking-transfer";
import { formatOccurrence } from "@/lib/format";
import { isMinor } from "@/lib/age";
import { sendBookingTransferEmail } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ occurrence_id: z.string().uuid() });

/** Named errors raised by mem_transfer_booking(), mapped to what a member can
 *  actually do about each. Anything unrecognised is a 500 — a blanket 409 on
 *  an unknown failure would imply the booking is untouched when we do not
 *  know that. */
function rpcFailure(error: { message?: string }, bookingId: string) {
  const message = error.message ?? "";
  const known: [string, string, number][] = [
    ["mem_already_transferred", "This booking has already been moved once. Please email enquiries@empowrcic.org.", 409],
    // Unreachable in normal use — the offer list is re-derived immediately
    // above the call — but a distinct message beats "no longer available" if
    // a target crosses the cutoff between the two.
    ["mem_target_too_soon", `That date is now less than ${TRANSFER_CUTOFF_HOURS} hours away, so it can't be moved to. Pick a later one.`, 409],
    ["mem_bad_cutoff", "Could not move this booking — please try again.", 500],
    ["mem_not_transferable", "This booking can't be moved to another date.", 403],
    ["mem_booking_not_confirmed", "Only confirmed bookings can be moved.", 409],
    ["mem_same_occurrence", "That is the date this booking is already on.", 400],
    ["mem_target_not_bookable", "That date is no longer available. Pick another.", 409],
    ["mem_capacity_exceeded", "That date just filled up. Pick another.", 409],
    ["mem_duplicate_booking", "This person is already booked on that date.", 409],
    ["mem_booking_not_found", "Booking not found", 404],
  ];
  for (const [code, text, status] of known) {
    if (message.includes(code)) return NextResponse.json({ error: text }, { status });
  }
  console.error("transfer: unmapped rpc failure", bookingId, error);
  return NextResponse.json(
    { error: "Could not move this booking — please try again." },
    { status: 500 }
  );
}

export async function GET(_request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  let booking;
  try {
    booking = await loadTransferBooking(id, authed.account.id);
  } catch {
    return NextResponse.json(
      { error: "Could not load this booking — please try again." },
      { status: 500 }
    );
  }
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Only confirmed bookings can be moved.", targets: [] },
      { status: 409 }
    );
  }

  const policy = evaluateTransferPolicy({
    transferable: booking.transferable,
    enrolmentScope: booking.enrolmentScope,
    startsAt: booking.startsAt,
    transferredAt: booking.transferredAt,
  });
  if (!policy.allowed) {
    return NextResponse.json({ error: policy.reason, targets: [] }, { status: 403 });
  }

  try {
    const targets = await listTransferTargets(booking);
    return NextResponse.json({
      targets: targets.map((t) => ({
        occurrence_id: t.occurrenceId,
        when: formatOccurrence(t.startsAt, t.endsAt),
        places_left: t.placesLeft,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load available dates — please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a date to move to." }, { status: 400 });
  }

  let booking;
  try {
    booking = await loadTransferBooking(id, authed.account.id);
  } catch {
    return NextResponse.json(
      { error: "Could not load this booking — please try again." },
      { status: 500 }
    );
  }
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (booking.status !== "confirmed") {
    return NextResponse.json({ error: "Only confirmed bookings can be moved." }, { status: 409 });
  }

  const policy = evaluateTransferPolicy({
    transferable: booking.transferable,
    enrolmentScope: booking.enrolmentScope,
    startsAt: booking.startsAt,
    transferredAt: booking.transferredAt,
  });
  if (!policy.allowed) {
    return NextResponse.json({ error: policy.reason }, { status: 403 });
  }

  // The target must be one this booking was actually offered. Re-deriving the
  // list rather than trusting the posted id is what keeps the age re-check and
  // the already-booked filter enforced — neither of those lives in the RPC.
  let targets;
  try {
    targets = await listTransferTargets(booking);
  } catch {
    return NextResponse.json(
      { error: "Could not load available dates — please try again." },
      { status: 500 }
    );
  }
  const target = targets.find((t) => t.occurrenceId === parsed.data.occurrence_id);
  if (!target) {
    return NextResponse.json(
      { error: "That date isn't available for this booking. Pick another." },
      { status: 409 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("mem_transfer_booking", {
    p_booking_id: booking.id,
    p_account_id: authed.account.id,
    p_target_occurrence_id: target.occurrenceId,
    // Passed rather than hardcoded in SQL: business-rules.ts owns this number
    // because it is published legal text, and a literal in the function would
    // keep the old value the day the policy changes.
    p_cutoff_hours: TRANSFER_CUTOFF_HOURS,
  });
  if (error) return rpcFailure(error, booking.id);
  if (!data) {
    console.error("transfer: rpc returned no row", booking.id);
    return NextResponse.json(
      { error: "Could not move this booking — please try again." },
      { status: 500 }
    );
  }

  const newWhen = formatOccurrence(target.startsAt, target.endsAt);
  const oldWhen = formatOccurrence(booking.startsAt, booking.endsAt);

  // Only a minor has a departure arrangement to lose, so only a minor's mover
  // gets the line about giving it again. Judged on the NEW date, which is the
  // date the arrangement would apply to.
  const departureConsentNeeded = booking.participantDob
    ? isMinor(booking.participantDob, new Date(target.startsAt))
    : false;

  // Best-effort, exactly as the cancel route treats its email: the booking has
  // already moved, and a mail failure must not be reported as a failed move.
  if (authed.user.email) {
    await sendBookingTransferEmail(authed.user.email, {
      offeringTitle: booking.offeringTitle,
      oldWhen,
      newWhen,
      participantNames: [booking.participantName],
      departureConsentNeeded,
    });
  }

  return NextResponse.json({
    ok: true,
    when: newWhen,
    departure_consent_needed: departureConsentNeeded,
  });
}
