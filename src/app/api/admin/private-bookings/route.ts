// POST /api/admin/private-bookings — record a private booking agreed and paid
// BEFORE online booking opened. Every new booking pays through Stripe
// checkout (owner decision 2026-09-29); this is not a second way to sell one.
//
// Admins only, never door staff: this creates a confirmed booking with no
// money moving through the app, so every use is attributed (the admin's user
// id, the fixed payment-handling value, an optional note), following
// planning/spec/admin-manual-booking.md. The waiver gate still applies to
// coaching skaters — a manual booking is not a way around it.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWaivers, persistWaiverMatches } from "@/lib/waivers";
import { accountContact } from "@/lib/notifications";
import { MANUAL_PAYMENT_HANDLING, privateManualSchema, privateRpcRefusal, type PrivateBookingRow } from "@/lib/private-bookings";
import { sendPrivateBookingConfirmation } from "@/lib/private-bookings-confirm";

export async function POST(request: Request) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = privateManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const service = createServiceClient();

  const contact = await accountContact(service, input.host_account_id);
  if (!contact) {
    return NextResponse.json({ error: "That member account could not be found." }, { status: 404 });
  }

  if (input.places.length > 0) {
    const ids = input.places.map((p) => p.participant_id);
    const { data: rows, error } = await service
      .from("mem_participants")
      .select("id, name, dob, person_id")
      .in("id", ids)
      .eq("account_id", input.host_account_id);
    if (error) {
      console.error("manual private booking: participants read failed", error);
      return NextResponse.json({ error: "Could not check the skaters — nothing was saved." }, { status: 500 });
    }
    if ((rows ?? []).length !== ids.length) {
      return NextResponse.json({ error: "Every skater must belong to the host’s account." }, { status: 400 });
    }
    const statuses = await checkWaivers(contact.email, rows ?? []);
    await persistWaiverMatches(statuses, rows ?? []);
    const unsigned = statuses.filter((s) => !s.signed);
    if (unsigned.length > 0) {
      const names = unsigned
        .map((s) => (rows ?? []).find((r) => r.id === s.participantId)?.name)
        .filter(Boolean)
        .join(", ");
      return NextResponse.json(
        { error: `No signed waiver on file for ${names}. Nothing was saved.` },
        { status: 409 }
      );
    }
  }

  const { data, error } = await service.rpc("mem_hold_private_booking", {
    p_account_id: input.host_account_id,
    p_kind: input.kind,
    p_starts_at: input.starts_at,
    p_hours: input.hours,
    p_paid_places: input.paid_places,
    p_places: input.places.map((p) => ({
      participant_id: p.participant_id,
      equipment: p.equipment,
      hire_size: p.equipment === "hire" ? p.hire_size ?? null : null,
    })),
    p_manual_by: admin.id,
    p_payment_handling: MANUAL_PAYMENT_HANDLING,
    p_note: input.note ?? null,
    p_price_pence: null,
  });
  if (error) {
    const refusal = privateRpcRefusal(error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("manual private booking failed", error);
    return NextResponse.json({ error: "Could not save the booking — nothing was changed." }, { status: 500 });
  }
  const booking = data as PrivateBookingRow;

  // The host must still hear about it: a booking they cannot see is worse
  // than none, because staff believe it exists.
  const emailed = await sendPrivateBookingConfirmation(service, booking.id, { staffAlert: false });
  return NextResponse.json({ booking: { id: booking.id }, emailed }, { status: 201 });
}
