import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendBookingConfirmationForSession } from "@/lib/notifications";
import { reconcileBrevo } from "@/lib/reconcile-brevo";
import { checkWaivers, persistWaiverMatches } from "@/lib/waivers";
import { recordDepartureConsents } from "@/lib/departure-consent";
import { isAgeEligible, ageOn } from "@/lib/age";
import { coverForOccurrence } from "@/lib/membership";
import { PENDING_BOOKING_EXPIRY_MINUTES } from "@/lib/business-rules";
import {
  getStripe,
  getOrCreateStripeCustomer,
  stripeCustomerAccount,
  HOLD_GRACE_MINUTES,
} from "@/lib/stripe";
import { courseRunWhen, formatOccurrence, formatPrice } from "@/lib/format";
import { requestOrigin } from "@/lib/request-origin";
import type { Booking, Participant } from "@/lib/types";
import type { BookingInput } from "@/lib/validation";
import { isRollerCamp, equipmentSelectionError } from "@/lib/roller-equipment";

type AuthedAccount = NonNullable<Awaited<ReturnType<typeof import("@/lib/auth").getAuthedAccount>>>;

type TargetRow = {
  starts: string | null;
  ends: string | null;
  label: string | null;
  starts_at_local?: string | null;
  ends_at_local?: string | null;
  offering: {
    id: string;
    title: string;
    slug: string;
    type: string;
    age_min: number | null;
    age_max: number | null;
  };
};

function itemKey(item: Pick<BookingInput, "occurrence_id" | "course_run_id">): string {
  return item.occurrence_id
    ? `occurrence:${item.occurrence_id}`
    : `course:${item.course_run_id}`;
}

/** Which basket entry a per-item failure belongs to.
 *
 *  The basket is now the ONLY checkout a member has (the booking form's
 *  "pay now" button went on 2026-09-16), so an error it cannot attribute to
 *  one card is an error the member cannot act on: two bookings, one name in
 *  the message, and no way to tell which one to edit.
 *
 *  Raw ids rather than itemKey(). The client composes its own key with
 *  targetKey() and the two formats stay independent — they happen to be
 *  identical strings today, and relying on that couples a wire format to a
 *  localStorage one. */
function failingItem(
  item: Pick<BookingInput, "occurrence_id" | "course_run_id">
): { occurrence_id: string } | { course_run_id: string } {
  return item.occurrence_id
    ? { occurrence_id: item.occurrence_id }
    : { course_run_id: item.course_run_id! };
}

function heldKey(booking: Booking): string {
  return booking.occurrence_id
    ? `occurrence:${booking.occurrence_id}`
    : `course:${booking.course_run_id}`;
}

function targetWhen(item: BookingInput, target: TargetRow): string {
  if (item.occurrence_id && target.starts && target.ends) {
    return formatOccurrence(target.starts, target.ends);
  }
  return courseRunWhen({
    label: target.label ?? "Course",
    starts_on: target.starts,
    ends_on: target.ends,
    starts_at_local: target.starts_at_local,
    ends_at_local: target.ends_at_local,
  });
}

/**
 * Turns a credit refusal into words a member can act on. Separate from
 * rpcFailure because the remedy is different in kind: a capacity refusal
 * means choose something else, whereas every case here means the figure on
 * screen is no longer the figure the database will honour.
 *
 * The holds are NOT cancelled here — returning a refusal falls out of
 * createBookingCheckout without touching them, and they expire on their own
 * as any abandoned checkout does. Nothing has been charged and no credit has
 * been spent, because mem_reserve_credit() is a single transaction that
 * either allocates everything or raises.
 */
function creditFailure(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("mem_credit_balance_changed")) {
    return NextResponse.json(
      {
        error: "credit_changed",
        message:
          "Your credit balance has changed since this basket was priced. Reopen your basket to see the new total.",
      },
      { status: 409 }
    );
  }
  if (message.includes("mem_credit_hold_invalid")) {
    return NextResponse.json(
      {
        error: "credit_changed",
        message: "This basket has already been sent for payment. Reopen your basket to start again.",
      },
      { status: 409 }
    );
  }
  // mem_credit_allocation_failed and mem_account_missing are both "should not
  // happen" states rather than anything the member did, so they are logged in
  // full and answered generically.
  console.error("credit reservation failed", error);
  return NextResponse.json(
    { error: "Could not apply your credit — please try again." },
    { status: 500 }
  );
}

function rpcFailure(error: { message?: string }) {
  const message = error.message ?? "";
  if (message.includes("mem_capacity_exceeded")) {
    return NextResponse.json(
      { error: "capacity", message: "Not enough spaces left on one of these sessions." },
      { status: 409 }
    );
  }
  if (message.includes("mem_duplicate_booking")) {
    return NextResponse.json(
      { error: "duplicate", message: "A participant is already booked on one of these sessions." },
      { status: 409 }
    );
  }
  if (message.includes("mem_not_bookable")) {
    return NextResponse.json({ error: "This session can no longer be booked." }, { status: 409 });
  }
  if (message.includes("mem_early_bird_exhausted")) {
    return NextResponse.json(
      {
        error: "early_bird_gone",
        message: "An early bird ticket has just sold out. Choose the standard ticket to continue.",
      },
      { status: 409 }
    );
  }
  if (message.includes("mem_early_bird_not_offered")) {
    return NextResponse.json(
      { error: "early_bird_gone", message: "There is no early bird ticket for this session." },
      { status: 409 }
    );
  }
  // The Zod schema on this route already rejects an over-size or
  // duplicate-target basket, so these only fire if the basket changed
  // (another tab, another device) between that check and this request.
  if (message.includes("mem_bad_basket_size") || message.includes("mem_duplicate_target")) {
    return NextResponse.json(
      {
        error: "basket_changed",
        message: "Your basket changed since this page loaded. Review it before paying.",
      },
      { status: 409 }
    );
  }
  console.error("booking hold failed", error);
  return NextResponse.json(
    { error: "Could not complete the booking — please try again." },
    { status: 500 }
  );
}

export async function createBookingCheckout(
  request: Request,
  authed: AuthedAccount,
  items: BookingInput[],
  options: {
    fromBasket?: boolean;
    /** Present only when the member chose to spend account credit on this
     *  purchase. `expectedPence` is what the basket SHOWED them, and the
     *  database refuses the reservation unless it agrees exactly — so the
     *  amount on screen and the amount charged cannot drift apart.
     *
     *  Credit is deliberately a property of the whole checkout, not of each
     *  item: it is one pot spent against one total, and the member pays the
     *  difference once. `BookingInput` therefore carries no credit field. */
    credit?: { expectedPence: number };
  } = {}
) {
  const service = createServiceClient();
  const participantIds = [...new Set(items.flatMap((item) => item.participant_ids))];

  if (items.some((item) => new Set(item.participant_ids).size !== item.participant_ids.length)) {
    return NextResponse.json({ error: "A participant can only appear once per session." }, { status: 400 });
  }

  const { data: participantRows, error: participantsError } = await service
    .from("mem_participants")
    .select("id, name, dob, person_id")
    .in("id", participantIds)
    .eq("account_id", authed.account.id);
  if (participantsError) {
    console.error("booking participants read failed", participantsError);
    return NextResponse.json(
      { error: "Could not start the booking — please try again." },
      { status: 500 }
    );
  }
  const participants = (participantRows ?? []) as Pick<
    Participant,
    "id" | "name" | "dob" | "person_id"
  >[];
  if (participants.length !== participantIds.length) {
    return NextResponse.json(
      { error: "One or more participants weren't recognised." },
      { status: 400 }
    );
  }
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));

  const targetEntries = await Promise.all(
    items.map(async (item): Promise<[string, TargetRow | null]> => {
      // Logged, not thrown: a null target refuses the whole basket below
      // with a 404, so a failed read fails CLOSED — no money taken, no
      // place given away. That polarity is right and stays. What the log
      // adds is the difference between a session that really was withdrawn
      // and a database fault, which the member-facing message cannot tell
      // apart and which otherwise leaves them stuck with no trace.
      if (item.occurrence_id) {
        const { data, error } = await service
          .from("mem_occurrences")
          .select("starts:starts_at, ends:ends_at, offering:mem_offerings(id, title, slug, type, age_min, age_max)")
          .eq("id", item.occurrence_id)
          .maybeSingle();
        if (error)
          console.error("checkout occurrence read failed", item.occurrence_id, error);
        return [itemKey(item), data ? ({ label: null, ...data } as unknown as TargetRow) : null];
      }
      const { data, error } = await service
        .from("mem_course_runs")
        .select("starts:starts_on, ends:ends_on, label, starts_at_local, ends_at_local, offering:mem_offerings(id, title, slug, type, age_min, age_max)")
        .eq("id", item.course_run_id!)
        .maybeSingle();
      if (error)
        console.error("checkout course run read failed", item.course_run_id, error);
      return [itemKey(item), data ? (data as unknown as TargetRow) : null];
    })
  );
  const targets = new Map(targetEntries);
  if ([...targets.values()].some((target) => !target)) {
    return NextResponse.json(
      { error: "One of these sessions can no longer be booked." },
      { status: 404 }
    );
  }

  for (const item of items) {
    const target = targets.get(itemKey(item))!;
    const equipmentError = equipmentSelectionError(
      isRollerCamp(target.offering),
      item.participant_ids,
      item.roller_equipment
    );
    if (equipmentError) return NextResponse.json({ error: equipmentError }, { status: 400 });

    const startDate = target.starts ? new Date(target.starts) : new Date();
    const ineligible = item.participant_ids
      .map((id) => participantById.get(id)!)
      .filter(
        (participant) =>
          !isAgeEligible(
            participant.dob,
            target.offering.age_min,
            target.offering.age_max,
            startDate
          )
      );
    if (ineligible.length > 0) {
      return NextResponse.json(
        {
          error: "age_ineligible",
          ineligible: ineligible.map((participant) => ({ id: participant.id, name: participant.name })),
          booking: failingItem(item),
        },
        { status: 422 }
      );
    }

    if (item.occurrence_id && target.starts) {
      let covered;
      try {
        covered = await coverForOccurrence(
          { offering_id: target.offering.id, starts_at: target.starts },
          { participantIds: item.participant_ids }
        );
      } catch (error) {
        console.error("subscription cover check failed", item.occurrence_id, error);
        return NextResponse.json(
          { error: "Could not start the booking — please try again." },
          { status: 500 }
        );
      }
      if (covered.length > 0) {
        return NextResponse.json(
          {
            error: "already_covered",
            booking: failingItem(item),
            covered: covered.map((entry) => ({
              id: entry.participant_id,
              name: participantById.get(entry.participant_id)?.name ?? "",
              plan: entry.plan_name,
            })),
          },
          { status: 409 }
        );
      }
    }
  }

  const waiverStatuses = await checkWaivers(authed.user.email ?? "", participants);
  await persistWaiverMatches(waiverStatuses, participants);
  const unsigned = waiverStatuses.filter((status) => !status.signed);
  if (unsigned.length > 0) {
    return NextResponse.json(
      {
        error: "waiver_required",
        unsigned: unsigned.map((status) => ({
          id: status.participantId,
          name: participantById.get(status.participantId)?.name ?? "",
        })),
      },
      { status: 409 }
    );
  }

  const personIdByParticipant = new Map<string, string>();
  for (const status of waiverStatuses) {
    const personId = status.matchedPersonId ?? participantById.get(status.participantId)?.person_id;
    if (personId) personIdByParticipant.set(status.participantId, personId);
  }

  const hold = items.length === 1
    ? await service.rpc("mem_hold_bookings", {
        p_account_id: authed.account.id,
        p_participant_ids: items[0].participant_ids,
        p_occurrence_id: items[0].occurrence_id ?? null,
        p_course_run_id: items[0].course_run_id ?? null,
        p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
        p_early_bird: items[0].early_bird,
      })
    : await service.rpc("mem_hold_booking_basket", {
        p_account_id: authed.account.id,
        p_items: items.map((item) => ({
          occurrence_id: item.occurrence_id ?? null,
          course_run_id: item.course_run_id ?? null,
          participant_ids: item.participant_ids,
          early_bird: item.early_bird,
        })),
        p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
      });

  if (hold.error) return rpcFailure(hold.error);
  const held = (hold.data ?? []) as Booking[];
  const heldIds = held.map((booking) => booking.id);
  // Safe to key on itemKey/heldKey alone because mem_hold_booking_basket()
  // (empowr-cic supabase/migrations) raises mem_duplicate_target before
  // holding anything if two items in the basket share a target — this
  // function never sees a basket where that lookup would be ambiguous.
  const itemForBooking = (booking: Booking) =>
    items.length === 1
      ? items[0]
      : items.find((candidate) => itemKey(candidate) === heldKey(booking));

  try {
    const consents = items.flatMap((item) => {
      const target = targets.get(itemKey(item))!;
      const startDate = target.starts ? new Date(target.starts) : new Date();
      const sessionDate = startDate.toISOString().slice(0, 10);
      return item.departure_consents
        .filter((entry) => {
          const participant = participantById.get(entry.participant_id);
          return participant && ageOn(participant.dob, startDate) < 18;
        })
        .map((entry) => {
          const personId = personIdByParticipant.get(entry.participant_id);
          const name = participantById.get(entry.participant_id)?.name;
          if (!personId || !name) return null;
          return { ...entry, personId, childName: name, sessionDate };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    });
    if (consents.length > 0) await recordDepartureConsents(consents);

    for (const item of items) {
      for (const entry of item.roller_equipment) {
        const booking = held.find(
          (candidate) =>
            itemForBooking(candidate) === item &&
            candidate.participant_id === entry.participant_id
        );
        if (!booking) throw new Error("Equipment booking hold missing");
        const { data: saved, error: saveError } = await service
          .from("mem_bookings")
          .update(entry.equipment)
          .eq("id", booking.id)
          .eq("account_id", authed.account.id)
          .eq("status", "pending_payment")
          .select("id")
          .single();
        if (saveError || !saved) throw new Error("Could not save camp equipment choices");
      }
    }

    // --- Account credit -------------------------------------------------
    //
    // The DATABASE decides how much credit applies and spreads it across the
    // held rows, oldest credit note first, under an account lock. Nothing
    // here re-derives it: mem_reserve_credit() returns the rows with
    // credit_applied_pence already set, and that column is what the card
    // total is computed from below.
    //
    // 🔑 THIS MUST STAY ABOVE THE STRIPE CALL. mem_reserve_credit() refuses
    // unless every row is still an unexpired pending_payment hold with
    // stripe_checkout_session_id IS NULL and no credit on it, and it stamps
    // its own token into that column. The link step further down overwrites
    // that token with the real cs_ id, which is why mem_settle_credit_
    // checkout() matches on EITHER value.
    //
    // No cleanup is needed if anything below throws: the catch cancels the
    // holds, and the mem_credit_booking_transition trigger releases every
    // reserved allocation in the same transaction as that status change.
    const creditByBooking = new Map<string, number>();
    let creditToken: string | null = null;
    if (options.credit && options.credit.expectedPence > 0) {
      creditToken = `memcredit_${randomUUID()}`;
      const reserved = await service.rpc("mem_reserve_credit", {
        p_account_id: authed.account.id,
        p_booking_ids: heldIds,
        p_expected: options.credit.expectedPence,
        p_token: creditToken,
      });
      if (reserved.error) return creditFailure(reserved.error);
      for (const row of (reserved.data ?? []) as Booking[]) {
        creditByBooking.set(row.id, row.credit_applied_pence ?? 0);
      }
    }
    const cardPenceFor = (booking: Booking) =>
      (booking.price_paid_pence ?? 0) - (creditByBooking.get(booking.id) ?? 0);
    const duePence = held.reduce((sum, booking) => sum + cardPenceFor(booking), 0);
    const creditPence = held.reduce(
      (sum, booking) => sum + (creditByBooking.get(booking.id) ?? 0),
      0
    );

    const origin = requestOrigin(request);

    // Credit covers the whole basket, so there is nothing to charge and no
    // Stripe Checkout to send them to — the bookings confirm here. Settling
    // by the token is what makes this reachable: mem_settle_credit_checkout()
    // stores that token as the session id, which is also what the
    // confirmation page and the confirmation email look the rows up by.
    if (creditToken && duePence === 0) {
      const settled = await service.rpc("mem_settle_credit_checkout", {
        p_token: creditToken,
        p_account_id: authed.account.id,
        p_session_id: creditToken,
        p_payment_intent: null,
        p_amount: 0,
        p_action: "paid",
      });
      if (settled.error) return creditFailure(settled.error);

      // 🔑 PAST THIS POINT NOTHING MAY THROW INTO THE CATCH BELOW. The
      // bookings are confirmed and the credit is spent; the catch only
      // cancels pending_payment rows, so a throw here would leave the member
      // a 500 "could not start the payment" over a booking that DID succeed —
      // and a retry would then be refused as already booked. Same rule the
      // stranded-hold alert follows: once value has moved, do not fail the
      // response. Both calls below are best-effort and say so.
      await sendBookingConfirmationForSession(service, creditToken);
      try {
        await reconcileBrevo(service, { accountIds: [authed.account.id] });
      } catch (brevoError) {
        console.error("credit booking Brevo sync failed", creditToken, brevoError);
      }

      return NextResponse.json(
        {
          // The basket clears itself off checkout_session_id, so the token
          // stands in for one. It is the real session id as far as every
          // read of these rows is concerned.
          checkout_url: `${origin}/book/confirmation?session_id=${creditToken}`,
          checkout_session_id: creditToken,
          bookings: held,
          credit_applied_pence: creditPence,
          card_pence: 0,
        },
        { status: 201 }
      );
    }

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(service, stripeCustomerAccount(authed));
    const only = items[0];
    const cancelPath = options.fromBasket
      ? "/basket"
      : only.occurrence_id
        ? `/book/${only.occurrence_id}`
        : `/book/run/${only.course_run_id}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: authed.account.id,
      // One line per booking, at the amount still owed on the CARD after any
      // credit. A row fully covered by credit is dropped: Stripe has nothing
      // to charge for it, and its place is already held and will confirm with
      // the rest. Stripe's minimum applies to the session TOTAL, not to a
      // line, and mem_reserve_credit() guarantees the total is either 0
      // (handled above) or at least 30p — so a small line is safe.
      line_items: held
        .filter((booking) => cardPenceFor(booking) > 0)
        .map((booking) => {
          const item = itemForBooking(booking);
          if (!item) throw new Error("Booking hold target missing");
          const target = targets.get(itemKey(item))!;
          const credited = creditByBooking.get(booking.id) ?? 0;
          return {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: cardPenceFor(booking),
              product_data: {
                name: target.offering.title,
                description: [
                  participantById.get(booking.participant_id)?.name,
                  targetWhen(item, target),
                  credited > 0
                    ? `${formatPrice(credited)} member credit applied`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" — "),
              },
            },
          };
        }),
      metadata: { booking_ids: heldIds.join(","), account_id: authed.account.id },
      payment_intent_data: {
        metadata: { booking_ids: heldIds.join(","), account_id: authed.account.id },
      },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${origin}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}`,
    });
    if (!session.url) throw new Error("Checkout session has no url");

    const graceExpiry = new Date(
      ((session.expires_at ?? Math.floor(Date.now() / 1000) + 31 * 60) +
        HOLD_GRACE_MINUTES * 60) *
        1000
    ).toISOString();
    const { error: linkError } = await service
      .from("mem_bookings")
      .update({ stripe_checkout_session_id: session.id, expires_at: graceExpiry })
      .in("id", heldIds);
    if (linkError) throw linkError;

    return NextResponse.json(
      {
        checkout_url: session.url,
        checkout_session_id: session.id,
        bookings: held,
        credit_applied_pence: creditPence,
        card_pence: duePence,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("checkout session creation failed", error);
    await service
      .from("mem_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in("id", heldIds)
      .eq("status", "pending_payment");
    return NextResponse.json(
      { error: "Could not start the payment — please try again." },
      { status: 500 }
    );
  }
}
