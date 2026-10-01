// Private bookings — the one confirmation sender and the Stripe webhook
// branch. Design: planning/architecture/private-bookings.md.
//
// Kept apart from private-bookings-server.ts on purpose: the webhook imports
// this, and it must not pull in the checkout's Stripe customer helpers.
import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { accountContact, sendStaffStrandedHoldAlert } from "@/lib/notifications";
import { links, membersUrl } from "@/lib/links";
import {
  buildPrivateBookingConfirmationEmail,
  buildPrivateTopupEmail,
  buildStaffPrivateBookingAlertEmail,
  buildStaffPrivateTopupAlertEmail,
} from "@/lib/emails/private-booking";
import {
  KIND_LABELS,
  PRIVATE_PLACE_SELECT,
  equipmentDeadline,
  equipmentLabel,
  formatPrivateSlot,
  type PrivateBookingRow,
  type PrivatePlaceRow,
  type PrivateTopupRow,
} from "@/lib/private-bookings";

async function venueLine(service: SupabaseClient, venueId: string): Promise<string | null> {
  const { data, error } = await service
    .from("mem_venues")
    .select("name, address, postcode")
    .eq("id", venueId)
    .maybeSingle();
  if (error) console.error("private booking venue read failed", venueId, error);
  if (!data) return null;
  return [data.name, data.address, data.postcode].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// The one confirmation sender — called by the webhook and the admin manual path
// ---------------------------------------------------------------------------

/** Emails the host their confirmation (and, for an online booking, alerts
 *  staff). Returns whether the HOST was emailed. Never throws: the booking is
 *  already confirmed and a mail failure must not undo or fail that. */
export async function sendPrivateBookingConfirmation(
  service: SupabaseClient,
  bookingId: string,
  options: { staffAlert: boolean }
): Promise<boolean> {
  try {
    const { data, error } = await service
      .from("mem_private_bookings")
      .select(`*, places:mem_private_booking_places(${PRIVATE_PLACE_SELECT})`)
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data) {
      console.error("private confirmation: booking read failed", bookingId, error);
      return false;
    }
    const booking = data as PrivateBookingRow & { places: PrivatePlaceRow[] };
    if (booking.status !== "confirmed" || !booking.host_account_id) {
      console.error("private confirmation: booking not confirmed", bookingId, booking.status);
      return false;
    }

    const contact = await accountContact(service, booking.host_account_id);
    if (!contact) {
      console.error("private confirmation: no recipient email", bookingId);
      return false;
    }

    const when = formatPrivateSlot(booking.starts_at, booking.ends_at);
    const isBirthday = booking.kind === "birthday";
    const paidOnline = booking.source === "online";
    const { subject, html } = buildPrivateBookingConfirmationEmail({
      hostName: contact.name,
      kindLabel: KIND_LABELS[booking.kind],
      when,
      venue: await venueLine(service, booking.venue_id),
      isBirthday,
      paidPlaces: booking.paid_places,
      totalPlaces: booking.total_places,
      skaters: isBirthday
        ? []
        : booking.places.map((p) => ({ name: p.participant?.name ?? "", equipment: equipmentLabel(p) })),
      amountPence: booking.price_pence,
      paidOnline,
      manageUrl: membersUrl(`/private-bookings/${booking.id}`),
      inviteUrl: isBirthday && booking.invite_token
        ? membersUrl(`/private-bookings/join/${booking.invite_token}`)
        : null,
      equipmentDeadline: isBirthday ? equipmentDeadline(booking.starts_at) : null,
    });
    const sent = await sendEmail({ to: contact.email, subject, html });

    // Staff entered a manual booking themselves; alerting them is noise.
    if (options.staffAlert) {
      const alert = buildStaffPrivateBookingAlertEmail({
        kindLabel: KIND_LABELS[booking.kind],
        when,
        places: isBirthday
          ? `${booking.total_places} (${booking.paid_places} paid + birthday person)`
          : String(booking.total_places),
        amountPence: booking.price_pence,
        hostName: contact.name,
        hostEmail: contact.email,
        adminUrl: membersUrl(`/checkin/private/${booking.id}`),
      });
      await sendEmail({ to: links.staffBookingAlerts, subject: alert.subject, html: alert.html });
    }
    return sent;
  } catch (err) {
    console.error("private confirmation threw", bookingId, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stripe webhook branch
// ---------------------------------------------------------------------------

/**
 * Handles a checkout.session.* event if it belongs to a private booking.
 * Returns null when it does not, so the caller falls through to the existing
 * booking logic UNCHANGED.
 *
 * A matching mem_private_bookings row is the positive identification. The
 * Stripe account is shared with Heroes, and every existing branch decides
 * ownership by querying mem_bookings — which finds nothing for a private
 * booking and would quietly do nothing, including on the paths that exist to
 * tell a human money moved without a booking.
 */
export async function handlePrivateCheckoutSession(
  service: SupabaseClient,
  eventType: "checkout.session.completed" | "checkout.session.expired",
  session: Stripe.Checkout.Session
): Promise<NextResponse | null> {
  const { data: rows, error } = await service
    .from("mem_private_bookings")
    .select("id, status")
    .eq("stripe_checkout_session_id", session.id);
  if (error) {
    // PGRST205: the table does not exist, i.e. the schema has not been
    // applied yet. There can be no private booking to claim, and returning
    // 500 here would make Stripe retry — and so block — EVERY ordinary
    // booking confirmation. Fall through to the existing logic instead.
    if (error.code === "PGRST205") return null;
    // Anything else is a transient database fault: let Stripe retry. The
    // existing branch would fail the same way on its own write.
    console.error("private checkout lookup failed", session.id, error);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }

  const ours = (rows ?? []) as { id: string; status: string }[];
  const flaggedPrivate = session.metadata?.kind === "private_booking";
  if (ours.length === 0 && !flaggedPrivate) return null;

  const labelled = ours.map((r) => ({ id: `private booking ${r.id}`, status: r.status }));
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const alertBase = {
    checkoutSessionId: session.id,
    paymentIntentId,
    amountPence: session.amount_total ?? null,
    memberEmail: session.customer_details?.email ?? null,
  };

  if (eventType === "checkout.session.expired") {
    const { error: releaseError } = await service
      .from("mem_private_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", session.id)
      .eq("status", "pending_payment");
    if (releaseError) {
      console.error("private hold release failed", session.id, releaseError);
      return NextResponse.json({ error: "Retry" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (ours.length === 0) {
    // Our metadata, but no row carries this session. The link write failed
    // after Checkout was created. Money may have moved against nothing.
    console.error("PRIVATE CHECKOUT WITH NO BOOKING ROW", session.id, session.metadata);
    if (session.payment_status === "paid") {
      await sendStaffStrandedHoldAlert({ reason: "paid_holds_released", ...alertBase, bookings: [] });
    }
    return NextResponse.json({ received: true });
  }

  if (session.payment_status !== "paid") {
    console.error("COMPLETED PRIVATE CHECKOUT WITH UNSETTLED PAYMENT", session.id, ours);
    await sendStaffStrandedHoldAlert({ reason: "completed_unpaid", ...alertBase, bookings: labelled });
    return NextResponse.json({ received: true });
  }

  const { data: confirmed, error: confirmError } = await service.rpc("mem_confirm_private_booking", {
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
  });
  if (confirmError) {
    console.error("private webhook confirm failed", session.id, confirmError);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }

  const confirmedRows = (confirmed ?? []) as PrivateBookingRow[];
  if (confirmedRows.length > 0) {
    for (const row of confirmedRows) {
      await sendPrivateBookingConfirmation(service, row.id, { staffAlert: true });
    }
    return NextResponse.json({ received: true });
  }

  // Nothing was pending. Already confirmed is a replay and fine; anything else
  // means the hold was released before the money landed — and the time may
  // since have gone to someone else, so a human decides: refund, or restore
  // if the interval is still free.
  const stranded = ours.filter((r) => r.status !== "confirmed");
  if (stranded.length > 0) {
    console.error("PAID PRIVATE CHECKOUT FOR RELEASED HOLD — refund or restore", session.id, stranded);
    await sendStaffStrandedHoldAlert({
      reason: "paid_holds_released",
      ...alertBase,
      bookings: stranded.map((r) => ({ id: `private booking ${r.id}`, status: r.status })),
    });
  }
  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Skaters added after booking: emails and the webhook branch
// ---------------------------------------------------------------------------

/** Emails the host and alerts staff. Never throws: the places are already added. */
async function sendPrivateTopupConfirmation(service: SupabaseClient, topup: PrivateTopupRow): Promise<void> {
  try {
    const { data: booking, error } = await service
      .from("mem_private_bookings")
      .select("id, kind, starts_at, ends_at, host_account_id, total_places")
      .eq("id", topup.private_booking_id)
      .maybeSingle();
    if (error || !booking?.host_account_id) {
      console.error("private topup confirmation: booking read failed", topup.id, error);
      return;
    }
    const contact = await accountContact(service, booking.host_account_id);
    if (!contact) {
      console.error("private topup confirmation: no recipient email", topup.id);
      return;
    }
    const when = formatPrivateSlot(booking.starts_at, booking.ends_at);
    const kindLabel = KIND_LABELS[booking.kind as keyof typeof KIND_LABELS];
    const { subject, html } = buildPrivateTopupEmail({
      hostName: contact.name,
      kindLabel,
      when,
      addedPlaces: topup.added_places,
      totalPlaces: booking.total_places,
      amountPence: topup.amount_pence,
      isBirthday: booking.kind === "birthday",
      manageUrl: membersUrl(`/private-bookings/${booking.id}`),
    });
    await sendEmail({ to: contact.email, subject, html });
    const alert = buildStaffPrivateTopupAlertEmail({
      kindLabel,
      when,
      addedPlaces: topup.added_places,
      totalPlaces: booking.total_places,
      amountPence: topup.amount_pence,
      hostName: contact.name,
      hostEmail: contact.email,
      adminUrl: membersUrl(`/checkin/private/${booking.id}`),
    });
    await sendEmail({ to: links.staffBookingAlerts, subject: alert.subject, html: alert.html });
  } catch (err) {
    console.error("private topup confirmation threw", topup.id, err);
  }
}

/**
 * Handles a checkout.session.* event if it pays for skaters added to a private
 * booking. Returns null when it does not, so the caller carries on unchanged.
 * Same rules as handlePrivateCheckoutSession: a matching top-up row (or our
 * own metadata) is the positive identification, and every path where money
 * may have moved without places being added tells a human.
 */
export async function handlePrivateTopupSession(
  service: SupabaseClient,
  eventType: "checkout.session.completed" | "checkout.session.expired",
  session: Stripe.Checkout.Session
): Promise<NextResponse | null> {
  const { data: rows, error } = await service
    .from("mem_private_booking_topups")
    .select("id, status")
    .eq("stripe_checkout_session_id", session.id);
  if (error) {
    if (error.code === "PGRST205") return null;
    console.error("private topup lookup failed", session.id, error);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }
  const ours = (rows ?? []) as { id: string; status: string }[];
  if (ours.length === 0 && session.metadata?.kind !== "private_topup") return null;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const alertBase = {
    checkoutSessionId: session.id,
    paymentIntentId,
    amountPence: session.amount_total ?? null,
    memberEmail: session.customer_details?.email ?? null,
  };
  const labelled = ours.map((r) => ({ id: `private booking addition ${r.id}`, status: r.status }));

  if (eventType === "checkout.session.expired") {
    const { error: releaseError } = await service
      .from("mem_private_booking_topups")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("stripe_checkout_session_id", session.id)
      .eq("status", "pending_payment");
    if (releaseError) {
      console.error("private topup release failed", session.id, releaseError);
      return NextResponse.json({ error: "Retry" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  if (ours.length === 0) {
    console.error("PRIVATE TOPUP CHECKOUT WITH NO ROW", session.id, session.metadata);
    if (session.payment_status === "paid") {
      await sendStaffStrandedHoldAlert({ reason: "paid_holds_released", ...alertBase, bookings: [] });
    }
    return NextResponse.json({ received: true });
  }

  if (session.payment_status !== "paid") {
    console.error("COMPLETED PRIVATE TOPUP WITH UNSETTLED PAYMENT", session.id, ours);
    await sendStaffStrandedHoldAlert({ reason: "completed_unpaid", ...alertBase, bookings: labelled });
    return NextResponse.json({ received: true });
  }

  const { data: confirmed, error: confirmError } = await service.rpc("mem_confirm_private_topup", {
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
  });
  if (confirmError) {
    console.error("private topup confirm failed", session.id, confirmError);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }
  const confirmedRows = (confirmed ?? []) as PrivateTopupRow[];
  for (const row of confirmedRows) await sendPrivateTopupConfirmation(service, row);
  if (confirmedRows.length > 0) return NextResponse.json({ received: true });

  // Nothing pending: a replay (already confirmed) is fine. A swept addition
  // means money was taken and no places added — a human refunds or restores.
  const stranded = ours.filter((r) => r.status !== "confirmed");
  if (stranded.length > 0) {
    console.error("PAID PRIVATE TOPUP FOR RELEASED HOLD — refund or restore", session.id, stranded);
    await sendStaffStrandedHoldAlert({
      reason: "paid_holds_released",
      ...alertBase,
      bookings: stranded.map((r) => ({ id: `private booking addition ${r.id}`, status: r.status })),
    });
  }
  return NextResponse.json({ received: true });
}
