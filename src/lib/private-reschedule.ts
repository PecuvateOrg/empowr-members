// Admin rescheduling of an existing private booking (issue #204). Called by
// /api/admin/private-bookings/[id]/reschedule. The move itself is one
// database transaction (mem_admin_reschedule_private_booking, ops/sql/
// admin-reschedule-private-booking.sql): the booking keeps its id, invite
// link, host, payment, guests, waivers and hire choices; only its time moves.
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { accountContact } from "@/lib/notifications";
import { membersUrl } from "@/lib/links";
import { buildPrivateBookingRescheduledEmail } from "@/lib/emails/private-booking";
import { venueLine } from "@/lib/private-bookings-confirm";
import {
  KIND_LABELS,
  equipmentDeadline,
  formatPrivateSlot,
  privateRpcRefusal,
  type PrivateKind,
} from "@/lib/private-bookings";

export const privateRescheduleSchema = z
  .object({
    expected_starts_at: z.string().datetime({ offset: true }),
    new_starts_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3, "Enter a reason for the move.").max(300),
    replace_block_id: z.string().uuid().nullable().optional(),
    block_old_slot: z.boolean().optional(),
    old_slot_note: z.string().trim().max(300).optional(),
    notify_host: z.boolean().optional(),
  })
  .refine((v) => !v.block_old_slot || (v.old_slot_note ?? "").length >= 3, {
    message: "Enter a reason for keeping the old time closed.",
    path: ["old_slot_note"],
  });

const RESCHEDULE_ERRORS: Record<string, { status: number; message: string }> = {
  mem_private_reschedule_stale: {
    status: 409,
    message: "This booking was changed by someone else. Refresh the page and check its time before moving it.",
  },
  mem_private_reschedule_same_time: { status: 400, message: "Choose a different time from the current one." },
  mem_private_reschedule_started: {
    status: 409,
    message: "This booking has started or has guests checked in, so it can no longer be moved.",
  },
  mem_private_reschedule_not_allowed: { status: 409, message: "Only confirmed bookings can be moved." },
  mem_private_reschedule_bad_hold: {
    status: 409,
    message: "The hold you chose is not an active staff hold on the new time. Refresh and choose again.",
  },
  mem_private_reschedule_invalid: { status: 400, message: "Check the new time and reasons, then try again." },
  mem_private_unavailable: {
    status: 409,
    message: "Something is already booked or held at the new time. Choose the staff hold to replace, or another time — a customer booking is never moved aside.",
  },
};

type Moved = { id: string; old_starts_at: string; old_ends_at: string; new_starts_at: string; new_ends_at: string };

export async function reschedulePrivateBooking(
  bookingId: string,
  input: z.infer<typeof privateRescheduleSchema>,
  userId: string
): Promise<NextResponse> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("mem_admin_reschedule_private_booking", {
    p_booking_id: bookingId,
    p_expected_starts_at: input.expected_starts_at,
    p_new_starts_at: input.new_starts_at,
    p_staff_user_id: userId,
    p_reason: input.reason,
    p_replace_block_id: input.replace_block_id ?? null,
    p_block_old_slot: input.block_old_slot ?? false,
    p_old_slot_note: input.block_old_slot ? input.old_slot_note ?? null : null,
  });
  if (error) {
    const key = Object.keys(RESCHEDULE_ERRORS)
      .filter((k) => error.message?.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    const refusal = key ? RESCHEDULE_ERRORS[key] : privateRpcRefusal(error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("private reschedule failed", bookingId, error);
    return NextResponse.json({ error: "Could not move this booking. Nothing was changed." }, { status: 500 });
  }

  const moved = data as Moved;
  const notified = input.notify_host ? await notifyHost(service, bookingId, moved) : false;
  return NextResponse.json({ moved, hostNotified: notified });
}

/** Never throws: the move has committed, and a mail failure must not read as
 *  a failed move. Returns whether the host was emailed. */
async function notifyHost(service: SupabaseClient, bookingId: string, moved: Moved): Promise<boolean> {
  try {
    const { data: booking, error } = await service
      .from("mem_private_bookings")
      .select("kind, venue_id, host_account_id, invite_token, equipment_deadline_days")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !booking?.host_account_id) {
      if (error) console.error("reschedule notice: booking read failed", bookingId, error);
      return false;
    }
    const contact = await accountContact(service, booking.host_account_id);
    if (!contact) {
      console.error("reschedule notice: no recipient email", bookingId);
      return false;
    }
    const isBirthday = booking.kind === "birthday";
    const { subject, html } = buildPrivateBookingRescheduledEmail({
      hostName: contact.name,
      kindLabel: KIND_LABELS[booking.kind as PrivateKind],
      oldWhen: formatPrivateSlot(moved.old_starts_at, moved.old_ends_at),
      newWhen: formatPrivateSlot(moved.new_starts_at, moved.new_ends_at),
      venue: await venueLine(service, booking.venue_id),
      manageUrl: membersUrl(`/private-bookings/${bookingId}`),
      inviteUrl: isBirthday && booking.invite_token ? membersUrl(`/private-bookings/join/${booking.invite_token}`) : null,
      equipmentDeadline: isBirthday ? equipmentDeadline(moved.new_starts_at, booking.equipment_deadline_days ?? 14) : null,
    });
    const sent = await sendEmail({ to: contact.email, subject, html });
    if (sent) {
      const { error: auditError } = await service
        .from("mem_private_booking_reschedules")
        .update({ host_notified_at: new Date().toISOString() })
        .eq("id", moved.id);
      if (auditError) console.error("reschedule notice: audit update failed", moved.id, auditError);
    }
    return sent;
  } catch (err) {
    console.error("reschedule notice threw", bookingId, err);
    return false;
  }
}
