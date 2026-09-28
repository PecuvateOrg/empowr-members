import { randomUUID } from "node:crypto";
import { refundBooking } from "@/lib/credits";
// POST /api/admin/occurrences/[id]/cancel — Empowr cancels a session.
// Members have no self-serve cancellation path (bookings are final by
// default); this route is the only way a refund or credit gets issued,
// and it's always an explicit, human, per-occurrence admin decision — the
// discretionary exception the Terms & Conditions describe. The admin
// picks ONE outcome (refund or credit) applied to every confirmed booking
// on the occurrence; unpaid pending_payment holds are just released.
// Bookings that already settled (cancelled/credited/refunded/attended/
// no_show) are left alone. Confirmed bookings for the same account are
// folded into one notice email, mirroring the booking-confirmation email.
import { NextResponse } from "next/server";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidateCatalogue } from "@/lib/revalidate";
import { CREDIT_EXPIRY_MONTHS } from "@/lib/business-rules";
import { formatOccurrence } from "@/lib/format";
import { cancelOccurrenceSchema } from "@/lib/validation";
import { sendOccurrenceCancelledEmail } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

type BookingRow = {
  id: string;
  account_id: string;
  status: string;
  price_paid_pence: number | null;
  stripe_payment_intent_id: string | null;
  participant: { name: string } | null;
};

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = cancelOccurrenceSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose refund or credit." },
      { status: 400 }
    );
  }
  const { outcome, reason } = parsed.data;

  const service = createServiceClient();
  const { data: occurrenceRow, error: occError } = await service
    .from("mem_occurrences")
    .select("id, starts_at, ends_at, status, offering:mem_offerings(title)")
    .eq("id", id)
    .maybeSingle();
  const occurrence = occurrenceRow as unknown as {
    id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    offering: { title: string } | null;
  } | null;
  if (occError) {
    console.error("admin cancel-occurrence: read failed", id, occError);
    return NextResponse.json(
      { error: "Could not load this session — please try again." },
      { status: 500 }
    );
  }
  if (!occurrence) {
    return NextResponse.json({ error: "Occurrence not found" }, { status: 404 });
  }
  if (occurrence.status === "cancelled_by_empowr") {
    return NextResponse.json(
      { error: "This session is already cancelled." },
      { status: 409 }
    );
  }

  const { data: bookingRows, error: bookingsError } = await service
    .from("mem_bookings")
    .select(
      "id, account_id, status, price_paid_pence, stripe_payment_intent_id, participant:mem_participants(name)"
    )
    .eq("occurrence_id", id)
    .in("status", ["confirmed", "pending_payment"]);
  if (bookingsError) {
    console.error("admin cancel-occurrence: bookings read failed", id, bookingsError);
    return NextResponse.json(
      { error: "Could not load this session's bookings — please try again." },
      { status: 500 }
    );
  }
  const bookings = (bookingRows ?? []) as unknown as BookingRow[];
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const pending = bookings.filter((b) => b.status === "pending_payment");

  const { data: claimed, error: claimError } = await service
    .from("mem_occurrences")
    .update({ status: "cancelled_by_empowr" })
    .eq("id", id)
    .eq("status", occurrence.status).select("id").maybeSingle();
  if (claimError || !claimed) {
    console.error("admin cancel-occurrence: claim failed", id, claimError);
    return NextResponse.json(
      { error: "Could not cancel this session — please try again." },
      { status: 500 }
    );
  }

  if (pending.length > 0) {
    await service
      .from("mem_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((b) => b.id)
      ).eq("status", "pending_payment");
  }

  let expiresOn: string | null = null;
  if (outcome === "credit") {
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + CREDIT_EXPIRY_MONTHS);
    expiresOn = expiry.toISOString();
  }

  const succeeded: { booking: BookingRow; amountPence: number; creditPence: number }[] = [];
  let failed = 0;

  for (const booking of confirmed) {
    const amountPence = booking.price_paid_pence ?? 0;
    try {
      let cardPence = amountPence;
      let creditPence = 0;
      if (amountPence === 0) {
        const cancelled = await service.from("mem_bookings").update({status:"cancelled",cancelled_at:new Date().toISOString()})
          .eq("id",booking.id).eq("status","confirmed");
        if (cancelled.error) throw cancelled.error;
      } else if (outcome === "refund") {
        const result = await refundBooking(booking.id,booking.account_id);
        cardPence = result.card_pence; creditPence = result.credit_pence;
      } else {
        const { error } = await service.rpc("mem_issue_credit",{
          p_account_id:booking.account_id,p_request_id:randomUUID(),p_staff_id:admin.id,
          p_booking_id:booking.id,p_amount:null,p_platform:null,p_reference:null,p_session:null,
          p_session_date:null,p_reason:reason || "Session cancelled by Empowr",p_expires_at:expiresOn,
        });
        if (error) throw error;
      }
      succeeded.push({ booking, amountPence: cardPence, creditPence });
    } catch (err) {
      console.error(
        `admin cancel-occurrence: ${outcome} failed for booking`,
        booking.id,
        err
      );
      failed += 1;
    }
  }

  // Fold same-account bookings into one notice email.
  const offeringTitle = occurrence.offering?.title ?? "";
  const when = formatOccurrence(occurrence.starts_at, occurrence.ends_at);
  const byAccount = new Map<string, { names: string[]; total: number; credit: number }>();
  for (const { booking, amountPence, creditPence } of succeeded) {
    const entry = byAccount.get(booking.account_id) ?? { names: [], total: 0, credit: 0 };
    if (booking.participant?.name) entry.names.push(booking.participant.name);
    entry.total += amountPence;
    entry.credit += creditPence;
    byAccount.set(booking.account_id, entry);
  }

  for (const [accountId, group] of byAccount) {
    const { data: accountRow } = await service
      .from("mem_accounts")
      .select("user_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!accountRow) continue;
    const { data: userData } = await service.auth.admin.getUserById(
      accountRow.user_id
    );
    const to = userData?.user?.email;
    if (!to) continue;
    await sendOccurrenceCancelledEmail(to, {
      offeringTitle,
      when,
      participantNames: group.names,
      outcome:
        outcome === "refund"
          ? { kind: "refund", amountPence: group.total, creditPence: group.credit }
          : { kind: "credit", amountPence: group.total, expiresOn: expiresOn! },
      reason: reason ?? undefined,
    });
  }

  await revalidateCatalogue("occurrence cancelled");
  return NextResponse.json({
    ok: true,
    releasedPending: pending.length,
    processed: succeeded.length,
    failed,
  });
}
