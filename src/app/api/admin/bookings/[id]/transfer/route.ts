import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { accountContact, sendBookingTransferEmail } from "@/lib/notifications";
import { formatOccurrence } from "@/lib/format";
import { isMinor } from "@/lib/age";
import {
  loadAdminTransferBooking,
  listAdminTransferTargets,
} from "@/lib/admin-booking-transfer";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.object({
  occurrence_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

function failure(message: string) {
  const known: Record<string, [number, string]> = {
    mem_booking_not_found: [404, "Booking not found."],
    mem_booking_not_transferable: [409, "Only confirmed or no-show date bookings can be transferred."],
    mem_same_occurrence: [400, "Choose a different date."],
    mem_target_not_bookable: [409, "That date is no longer available."],
    mem_capacity_exceeded: [409, "That date has just filled up."],
    mem_duplicate_booking: [409, "This skater already has a booking on that date."],
    mem_jam_hire_not_allowed: [409, "The attached skate hire is not available on that date."],
    mem_jam_hire_sold_out: [409, "The attached skate size is sold out on that date."],
  };
  const entry = Object.entries(known).find(([code]) => message.includes(code));
  return entry ? NextResponse.json({ error: entry[1][1] }, { status: entry[1][0] }) : null;
}

export async function GET(_request: Request, { params }: Params) {
  if (!await getAuthedAdmin()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  try {
    const booking = await loadAdminTransferBooking(id);
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (!["confirmed", "no_show"].includes(booking.status)) {
      return NextResponse.json({ error: "Only confirmed or no-show bookings can be transferred." }, { status: 409 });
    }
    return NextResponse.json({ targets: await listAdminTransferTargets(booking) });
  } catch (error) {
    console.error("admin transfer dates failed", id, error);
    return NextResponse.json({ error: "Could not load available dates." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a date and enter a reason." }, { status: 400 });

  try {
    const booking = await loadAdminTransferBooking(id);
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const targets = await listAdminTransferTargets(booking);
    const target = targets.find((item) => item.occurrence_id === parsed.data.occurrence_id);
    if (!target) return NextResponse.json({ error: "That date is not available for this booking." }, { status: 409 });

    const service = createServiceClient();
    const { error } = await service.rpc("mem_admin_transfer_booking", {
      p_booking_id: id,
      p_target_occurrence_id: target.occurrence_id,
      p_staff_user_id: admin.id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      const mapped = failure(error.message ?? "");
      if (mapped) return mapped;
      console.error("admin transfer rpc failed", id, error);
      return NextResponse.json({ error: "Could not transfer this booking." }, { status: 500 });
    }

    const contact = await accountContact(service, booking.accountId);
    const newWhen = formatOccurrence(target.starts_at, target.ends_at);
    const oldWhen = formatOccurrence(booking.startsAt, booking.endsAt);
    const departureConsentNeeded = booking.participantDob
      ? isMinor(booking.participantDob, new Date(target.starts_at)) : false;
    const emailed = contact ? await sendBookingTransferEmail(contact.email, {
      offeringTitle: booking.offeringTitle, oldWhen, newWhen,
      participantNames: [booking.participantName], departureConsentNeeded,
    }) : false;
    return NextResponse.json({ ok: true, when: newWhen, emailed });
  } catch (error) {
    console.error("admin transfer failed", id, error);
    return NextResponse.json({ error: "Could not transfer this booking." }, { status: 500 });
  }
}
