import "server-only";

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
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
import { courseRunWhen, formatOccurrence } from "@/lib/format";
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
  options: { fromBasket?: boolean } = {}
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
      if (item.occurrence_id) {
        const { data } = await service
          .from("mem_occurrences")
          .select("starts:starts_at, ends:ends_at, offering:mem_offerings(id, title, slug, type, age_min, age_max)")
          .eq("id", item.occurrence_id)
          .maybeSingle();
        return [itemKey(item), data ? ({ label: null, ...data } as unknown as TargetRow) : null];
      }
      const { data } = await service
        .from("mem_course_runs")
        .select("starts:starts_on, ends:ends_on, label, starts_at_local, ends_at_local, offering:mem_offerings(id, title, slug, type, age_min, age_max)")
        .eq("id", item.course_run_id!)
        .maybeSingle();
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

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(service, stripeCustomerAccount(authed));
    const origin = requestOrigin(request);
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
      line_items: held.map((booking) => {
        const item = itemForBooking(booking);
        if (!item) throw new Error("Booking hold target missing");
        const target = targets.get(itemKey(item))!;
        return {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: booking.price_paid_pence ?? 0,
            product_data: {
              name: target.offering.title,
              description: [
                participantById.get(booking.participant_id)?.name,
                targetWhen(item, target),
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
