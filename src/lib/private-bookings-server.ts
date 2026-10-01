// Private bookings — server side: reads, the reverse-clash check and
// checkout. Design: planning/architecture/private-bookings.md. The webhook
// branch and the confirmation sender live in private-bookings-confirm.ts.
//
// Every decision about availability and price is made by the database under
// its date lock. Nothing here re-derives either; it validates input, calls the
// function, and maps a refusal to words.
import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getOrCreateStripeCustomer, stripeCustomerAccount, HOLD_GRACE_MINUTES } from "@/lib/stripe";
import { checkWaivers, persistWaiverMatches } from "@/lib/waivers";
import { PENDING_BOOKING_EXPIRY_MINUTES } from "@/lib/business-rules";
import { requestOrigin } from "@/lib/request-origin";
import {
  KIND_LABELS,
  formatPrivateSlot,
  privateRpcRefusal,
  type AvailableSlot,
  type PrivateBookingRequest,
  type PrivateBookingRow,
  type PrivateBookingType,
  type PrivateKind,
} from "@/lib/private-bookings";
import type { AuthedAccount } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every type row, active or not — or `null` when the private-bookings schema
 * has not been applied to the database yet.
 *
 * Any OTHER failure throws: the booking page must not render "nothing to
 * book" over a database fault. PGRST205 is the single exception because it is
 * the one failure that positively identifies itself — PostgREST returns it
 * (404) only when the table is not in the schema cache at all. Confirmed
 * against the live project: a missing table gives PGRST205, while a missing
 * RPC gives PGRST202.
 *
 * 🔑 `null` and `[]` MUST stay distinguishable, which is why this returns a
 * union rather than an empty array. `[]` means the table exists and holds no
 * types — a configuration state. `null` means the tables are absent, so every
 * write on the admin screen would fail too. Those need different words on
 * screen, and the compiler forces both callers to choose.
 */
export async function listPrivateTypes(): Promise<PrivateBookingType[] | null> {
  const { data, error } = await createServiceClient()
    .from("mem_private_booking_types")
    .select("kind, title, unit_price_pence, min_places, max_places, hire_price_pence, active")
    .order("kind");
  if (error) {
    if (error.code === "PGRST205") return null;
    console.error("private booking types read failed", error);
    throw new Error("private_types_read_failed");
  }
  return (data ?? []) as PrivateBookingType[];
}

/** Open intervals between two London dates, straight from the same SQL rule
 *  the hold enforces. */
export async function listPrivateAvailability(from: string, to: string): Promise<AvailableSlot[]> {
  const { data, error } = await createServiceClient().rpc("mem_public_private_availability", {
    p_from: from,
    p_to: to,
  });
  if (error) {
    console.error("private availability read failed", error);
    throw new Error("private_availability_read_failed");
  }
  return (data ?? []) as AvailableSlot[];
}


/**
 * The reverse clash: refuse to schedule a Members session over an active
 * private booking or block in the same space. Returns the refusal, or null.
 *
 * PGRST202 (function not found) is the one error treated as "no clash": it
 * means the private-bookings schema has not been applied yet, in which case
 * there are no private bookings to collide with. Every other failure refuses,
 * because saving a session over a paid party is the outcome this prevents.
 */
export async function privateClashRefusal(
  service: SupabaseClient,
  occurrence: { offering_id: string; venue_id: string | null; starts_at: string; ends_at: string }
): Promise<{ status: number; error: string } | null> {
  const unchecked = {
    status: 500,
    error: "Could not check for private bookings at that time — nothing was saved. Please try again.",
  };
  let venueId = occurrence.venue_id;
  if (!venueId) {
    const { data, error } = await service
      .from("mem_offerings")
      .select("venue_id")
      .eq("id", occurrence.offering_id)
      .maybeSingle();
    if (error) {
      console.error("private clash: offering venue read failed", error);
      return unchecked;
    }
    venueId = (data?.venue_id as string | null) ?? null;
  }
  if (!venueId) return null;

  const { data: clashId, error } = await service.rpc("mem_private_clash", {
    p_venue_id: venueId,
    p_starts_at: occurrence.starts_at,
    p_ends_at: occurrence.ends_at,
  });
  if (error) {
    if (error.code === "PGRST202") return null;
    console.error("private clash check failed", error);
    return unchecked;
  }
  if (!clashId) return null;

  // Only the wording depends on this read. The refusal itself is already
  // decided, so a failed read degrades to a less specific message.
  const { data: clash, error: clashError } = await service
    .from("mem_private_bookings")
    .select("kind, starts_at, ends_at")
    .eq("id", clashId)
    .maybeSingle();
  if (clashError) console.error("private clash detail read failed", clashId, clashError);
  const what = clash
    ? `${KIND_LABELS[clash.kind as PrivateKind].toLowerCase()} on ${formatPrivateSlot(clash.starts_at, clash.ends_at)}`
    : "private booking";
  return {
    status: 409,
    error: `This overlaps a ${what} in the same space. Resolve that first — a private booking is never cancelled automatically.`,
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function createPrivateBookingCheckout(
  request: Request,
  authed: AuthedAccount,
  input: PrivateBookingRequest
) {
  const service = createServiceClient();

  // Coaching skaters are the host's own participants, so the existing
  // single-account waiver check covers them. Birthday guests are checked one
  // by one, on their own accounts, when they join.
  const participantIds = input.places.map((p) => p.participant_id);
  const names = new Map<string, string>();
  if (participantIds.length > 0) {
    const { data: rows, error } = await service
      .from("mem_participants")
      .select("id, name, dob, person_id")
      .in("id", participantIds)
      .eq("account_id", authed.account.id);
    if (error) {
      console.error("private booking participants read failed", error);
      return NextResponse.json({ error: "Could not start the booking — please try again." }, { status: 500 });
    }
    if ((rows ?? []).length !== participantIds.length) {
      return NextResponse.json({ error: "One of those skaters isn’t on your account." }, { status: 400 });
    }
    for (const row of rows ?? []) names.set(row.id, row.name);
    const statuses = await checkWaivers(authed.user.email ?? "", rows ?? []);
    await persistWaiverMatches(statuses, rows ?? []);
    const unsigned = statuses.filter((s) => !s.signed);
    if (unsigned.length > 0) {
      return NextResponse.json(
        {
          error: "waiver_required",
          unsigned: unsigned.map((s) => ({ id: s.participantId, name: names.get(s.participantId) ?? "" })),
        },
        { status: 409 }
      );
    }
  }

  const hold = await service.rpc("mem_hold_private_booking", {
    p_account_id: authed.account.id,
    p_kind: input.kind,
    p_starts_at: input.starts_at,
    p_hours: input.hours,
    p_paid_places: input.paid_places,
    p_places: input.places.map((p) => ({
      participant_id: p.participant_id,
      equipment: p.equipment,
      hire_size: p.equipment === "hire" ? p.hire_size ?? null : null,
    })),
    p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
  });
  if (hold.error) {
    const refusal = privateRpcRefusal(hold.error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("private booking hold failed", hold.error);
    return NextResponse.json({ error: "Could not start the booking — please try again." }, { status: 500 });
  }
  const booking = hold.data as PrivateBookingRow;

  try {
    const when = formatPrivateSlot(booking.starts_at, booking.ends_at);
    const basePence = booking.price_pence - booking.hire_pence;
    const hireCount = input.places.filter((p) => p.equipment === "hire").length;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: basePence,
          product_data: {
            name: KIND_LABELS[booking.kind],
            description: `${when} — ${booking.total_places} ${booking.total_places === 1 ? "place" : "places"}`,
          },
        },
      },
    ];
    if (booking.hire_pence > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: booking.hire_pence,
          product_data: {
            name: "Equipment hire",
            description: `${hireCount} ${hireCount === 1 ? "skater" : "skaters"} — skates, pads and helmet`,
          },
        },
      });
    }

    const metadata = {
      kind: "private_booking",
      private_booking_id: booking.id,
      account_id: authed.account.id,
    };
    const customerId = await getOrCreateStripeCustomer(service, stripeCustomerAccount(authed));
    const origin = requestOrigin(request);
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      // Card only: redirect methods can settle after the interval hold is
      // released, which would take money against a time given to someone else.
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: authed.account.id,
      line_items: lineItems,
      metadata,
      payment_intent_data: { metadata },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${origin}/private-bookings/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/private-bookings`,
    });
    if (!session.url) throw new Error("Checkout session has no url");

    const graceExpiry = new Date(
      ((session.expires_at ?? Math.floor(Date.now() / 1000) + 31 * 60) + HOLD_GRACE_MINUTES * 60) * 1000
    ).toISOString();
    const { error: linkError } = await service
      .from("mem_private_bookings")
      .update({ stripe_checkout_session_id: session.id, expires_at: graceExpiry })
      .eq("id", booking.id)
      .eq("status", "pending_payment");
    if (linkError) throw linkError;

    return NextResponse.json({ checkout_url: session.url, private_booking_id: booking.id }, { status: 201 });
  } catch (error) {
    console.error("private booking checkout failed", booking.id, error);
    await service
      .from("mem_private_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "pending_payment");
    return NextResponse.json({ error: "Could not start the payment — please try again." }, { status: 500 });
  }
}

