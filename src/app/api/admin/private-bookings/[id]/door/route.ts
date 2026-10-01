// /api/admin/private-bookings/[id]/door — staff add skaters to a private
// booking at the door, and the customer pays on their own phone (the walk-in
// pattern). GET searches members' skaters for a group coaching booking; POST
// holds the addition through mem_hold_private_topup (source = door) and
// returns a Stripe link plus QR code. The webhook adds the places once paid,
// exactly as for the host's online additions.
//
// Birthday: a count — each new guest still joins through the invite link and
// signs a waiver there. Group coaching: one member's skaters, each covered by
// a signed waiver (checked here, fail closed) before any money is taken.
import { NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { getAuthedCheckinStaff } from "@/lib/admin";
import { searchPrivateDoorCandidates } from "@/lib/admin-data";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getOrCreateStripeCustomer, HOLD_GRACE_MINUTES } from "@/lib/stripe";
import { checkWaivers } from "@/lib/waivers";
import { qrDataUrl } from "@/lib/qr";
import { requestOrigin } from "@/lib/request-origin";
import { PENDING_BOOKING_EXPIRY_MINUTES } from "@/lib/business-rules";
import {
  KIND_LABELS,
  formatPrivateSlot,
  isHired,
  privateRpcRefusal,
  privateTopupRequestSchema,
  type PrivateKind,
  type PrivateTopupRow,
} from "@/lib/private-bookings";

type Params = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

export async function GET(request: Request, { params }: Params) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!uuid.safeParse(id).success || query.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchPrivateDoorCandidates(query, id) });
}

export async function POST(request: Request, { params }: Params) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  if (!uuid.safeParse(id).success) {
    return NextResponse.json({ error: "We couldn’t find that booking." }, { status: 404 });
  }
  const parsed = privateTopupRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const service = createServiceClient();

  const { data: booking, error: bookingError } = await service
    .from("mem_private_bookings")
    .select("id, kind, starts_at, ends_at, host_account_id")
    .eq("id", id)
    .maybeSingle();
  if (bookingError) {
    console.error("door add booking read failed", id, bookingError);
    return NextResponse.json({ error: "Could not add skaters — please try again." }, { status: 500 });
  }
  if (!booking?.host_account_id) {
    return NextResponse.json({ error: "We couldn’t find that booking." }, { status: 404 });
  }

  // Who pays. Birthday: the booking's host account carries it (the guest's
  // parent pays on their own phone, anonymously). Group: the skaters' one
  // account, whose waiver cover is checked now.
  let payerAccountId: string = booking.host_account_id;
  let payerEmail: string | null = null;
  if (input.places.length > 0) {
    const { data: rows, error } = await service
      .from("mem_participants")
      .select("id, name, dob, person_id, account_id, account:mem_accounts(id, name, user_id, stripe_customer_id)")
      .in("id", input.places.map((p) => p.participant_id));
    if (error) {
      console.error("door add participants read failed", id, error);
      return NextResponse.json({ error: "Could not add skaters — please try again." }, { status: 500 });
    }
    const found = (rows ?? []) as unknown as {
      id: string;
      name: string;
      dob: string;
      person_id: string | null;
      account_id: string;
      account: { id: string; name: string; user_id: string; stripe_customer_id: string | null } | null;
    }[];
    const accounts = new Set(found.map((r) => r.account_id));
    if (found.length !== input.places.length || accounts.size !== 1) {
      return NextResponse.json(
        { error: "Add skaters from one family at a time — each family pays separately." },
        { status: 400 }
      );
    }
    payerAccountId = found[0].account_id;
    const { data: authUser, error: authError } = await service.auth.admin.getUserById(
      found[0].account?.user_id ?? ""
    );
    if (authError) console.error("door add account email lookup failed", payerAccountId, authError);
    payerEmail = authUser?.user?.email ?? null;
    if (!payerEmail) {
      return NextResponse.json({ error: "Couldn’t check that family’s waiver — please try again." }, { status: 500 });
    }
    const statuses = await checkWaivers(payerEmail, found);
    const unsigned = found.filter((r) => !statuses.find((s) => s.participantId === r.id && s.signed));
    if (unsigned.length > 0) {
      return NextResponse.json(
        { error: `No signed waiver for ${unsigned.map((u) => u.name).join(", ")}. They need one before they skate.` },
        { status: 409 }
      );
    }
  }

  const hold = await service.rpc("mem_hold_private_topup", {
    p_booking_id: id,
    p_account_id: payerAccountId,
    p_added_places: input.added_places,
    p_places: input.places.map((p) => ({
      participant_id: p.participant_id,
      equipment: p.equipment,
      hire_size: p.equipment === "hire" ? p.hire_size ?? null : null,
    })),
    p_source: "door",
    p_created_by: staff.id,
    p_expiry_minutes: PENDING_BOOKING_EXPIRY_MINUTES,
  });
  if (hold.error) {
    const refusal = privateRpcRefusal(hold.error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("door add hold failed", id, hold.error);
    return NextResponse.json({ error: "Could not add skaters — please try again." }, { status: 500 });
  }
  const topup = hold.data as PrivateTopupRow;

  try {
    const when = formatPrivateSlot(booking.starts_at, booking.ends_at);
    const hireCount = input.places.filter((p) => isHired(p.equipment)).length;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: topup.amount_pence - topup.hire_pence,
          product_data: {
            name: `${KIND_LABELS[booking.kind as PrivateKind]} — extra skaters`,
            description: `${when} — ${topup.added_places} more ${topup.added_places === 1 ? "place" : "places"}`,
          },
        },
      },
    ];
    if (topup.hire_pence > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: topup.hire_pence,
          product_data: { name: "Equipment hire", description: `${hireCount} ${hireCount === 1 ? "skater" : "skaters"}` },
        },
      });
    }
    const metadata = {
      kind: "private_topup",
      private_topup_id: topup.id,
      private_booking_id: id,
      account_id: payerAccountId,
      source: "door",
    };

    // Group: the paying family's Stripe customer, as for a walk-in. Birthday:
    // no customer — whoever scans pays, and the host's card is never used.
    let customer: string | undefined;
    if (payerEmail) {
      const { data: acct, error: acctError } = await service
        .from("mem_accounts")
        .select("id, name, stripe_customer_id")
        .eq("id", payerAccountId)
        .maybeSingle();
      // Inside the try: a failed read cancels the hold below rather than
      // starting a checkout with no customer.
      if (acctError) throw acctError;
      if (acct) {
        customer = await getOrCreateStripeCustomer(service, {
          id: acct.id,
          name: acct.name,
          email: payerEmail,
          stripe_customer_id: acct.stripe_customer_id,
        });
      }
    }

    const origin = requestOrigin(request);
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      ...(customer ? { customer } : {}),
      client_reference_id: payerAccountId,
      line_items: lineItems,
      metadata,
      payment_intent_data: { metadata },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${origin}/private-bookings/added`,
      cancel_url: `${origin}/private-bookings/added?cancelled=1`,
    });
    if (!session.url) throw new Error("Checkout session has no url");

    // Same grace as every hold: Stripe's own expiry plus HOLD_GRACE_MINUTES,
    // so a payment completed in the last minute is not swept first.
    const graceExpiry = new Date(
      ((session.expires_at ?? Math.floor(Date.now() / 1000) + 31 * 60) + HOLD_GRACE_MINUTES * 60) * 1000
    ).toISOString();
    const { error: linkError } = await service
      .from("mem_private_booking_topups")
      .update({ stripe_checkout_session_id: session.id, expires_at: graceExpiry })
      .eq("id", topup.id)
      .eq("status", "pending_payment");
    if (linkError) throw linkError;

    return NextResponse.json(
      { checkout_url: session.url, qr_data_url: await qrDataUrl(session.url), amount_pence: topup.amount_pence },
      { status: 201 }
    );
  } catch (error) {
    console.error("door add checkout failed", topup.id, error);
    await service
      .from("mem_private_booking_topups")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", topup.id)
      .eq("status", "pending_payment");
    return NextResponse.json({ error: "Could not start the payment — please try again." }, { status: 500 });
  }
}
