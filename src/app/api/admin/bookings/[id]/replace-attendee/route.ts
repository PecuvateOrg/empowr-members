import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { searchWalkInCandidates } from "@/lib/admin-data";
import { checkWaivers } from "@/lib/waivers";
import { coverForOccurrence } from "@/lib/membership";
import { isAgeEligible } from "@/lib/age";
import { REPLACEMENT_PARTICIPANT_COLUMNS, type ReplacementParticipant } from "@/lib/attendee-replacements";

type Params = { params: Promise<{ id: string }> };
const input = z.object({
  participant_id: z.string().uuid(),
  expected_participant_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

async function loadBooking(id: string) {
  const service = createServiceClient();
  const { data, error } = await service.from("mem_bookings")
    .select("participant_id, occurrence_id, course_run_id, source, status, occurrence:mem_occurrences(starts_at, status, offering_id, offering:mem_offerings(age_min, age_max))")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as unknown as {
    participant_id: string; occurrence_id: string | null; course_run_id: string | null;
    source: string; status: string;
    occurrence: { starts_at: string; offering_id: string; status: string; offering: { age_min: number | null; age_max: number | null } } | null;
  };
}

function eligible(booking: NonNullable<Awaited<ReturnType<typeof loadBooking>>>) {
  return booking.occurrence_id && !booking.course_run_id && booking.source !== "member"
    && ["confirmed", "attended", "no_show"].includes(booking.status)
    && booking.occurrence && ["scheduled", "completed"].includes(booking.occurrence.status)
    && new Date(booking.occurrence.starts_at).getTime() <= Date.now();
}

export async function GET(request: Request, { params }: Params) {
  if (!await getAuthedAdmin()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  try {
    const booking = await loadBooking(id);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!eligible(booking)) return NextResponse.json({ error: "Only date bookings for sessions that have started can be corrected. Subscription and course places cannot be replaced." }, { status: 409 });
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    const candidates = q.length >= 2 && q.length <= 100
      ? await searchWalkInCandidates(q, booking.occurrence_id!) : [];
    return NextResponse.json({ original_participant_id: booking.participant_id,
      results: candidates.filter(p => p.id !== booking.participant_id).map(p => ({
        id: p.id, name: p.name, accountName: p.accountName, ageEligible: p.ageEligible,
        waiverSigned: p.waiverSigned, alreadyBooked: p.alreadyBooked || Boolean(p.coveredByPlan),
      })),
    });
  } catch (error) {
    console.error("replace attendee lookup failed", error);
    return NextResponse.json({ error: "Could not load replacement attendees." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Choose an attendee and enter a reason." }, { status: 400 });
  try {
    const booking = await loadBooking(id);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (!eligible(booking)) return NextResponse.json({ error: "This booking cannot have its attendee replaced." }, { status: 409 });
    const service = createServiceClient();
    const { data, error } = await service.from("mem_participants")
      .select(REPLACEMENT_PARTICIPANT_COLUMNS).eq("id", parsed.data.participant_id).maybeSingle();
    if (error) throw error;
    const participant = data as unknown as ReplacementParticipant | null;
    if (!participant?.dob || !participant.account?.user_id) return NextResponse.json({ error: "Member profile is incomplete." }, { status: 409 });
    const occurrence = booking.occurrence!;
    if (!isAgeEligible(participant.dob, occurrence.offering.age_min, occurrence.offering.age_max, new Date(occurrence.starts_at))) {
      return NextResponse.json({ error: "This member is not the right age for this session." }, { status: 409 });
    }
    const cover = await coverForOccurrence({ offering_id: occurrence.offering_id, starts_at: occurrence.starts_at }, { participantIds: [participant.id] });
    if (cover.length) return NextResponse.json({ error: "This member already has subscription cover for this session." }, { status: 409 });
    const { data: auth, error: authError } = await service.auth.admin.getUserById(participant.account.user_id);
    if (authError || !auth.user?.email) return NextResponse.json({ error: "Could not verify this member's waiver." }, { status: 409 });
    const statuses = await checkWaivers(auth.user.email, [participant]);
    if (!statuses.some(s => s.participantId === participant.id && s.signed)) {
      return NextResponse.json({ error: "The replacement attendee needs their own signed waiver." }, { status: 409 });
    }
    const { error: rpcError } = await service.rpc("mem_admin_replace_attendee", {
      p_booking_id: id, p_participant_id: participant.id, p_staff_user_id: admin.id,
      p_reason: parsed.data.reason, p_expected_participant_id: parsed.data.expected_participant_id,
      p_waiver_response_id: statuses.find(s => s.participantId === participant.id)?.backfillFromResponseId ?? null,
    });
    if (rpcError) {
      if (rpcError.message.includes("mem_duplicate_booking")) return NextResponse.json({ error: "This member already has a place on that session." }, { status: 409 });
      if (rpcError.message.includes("mem_replacement_waiver_required")) return NextResponse.json({ error: "The waiver changed. Confirm the member has a current signed waiver and try again." }, { status: 409 });
      if (rpcError.message.includes("mem_replacement_subscription_cover")) return NextResponse.json({ error: "This member already has subscription cover for this session." }, { status: 409 });
      if (/mem_replacement_|mem_booking_not_found/.test(rpcError.message)) return NextResponse.json({ error: "This booking has changed or cannot be corrected. Refresh the register." }, { status: 409 });
      throw rpcError;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("replace attendee failed", error);
    return NextResponse.json({ error: "Could not replace the attendee." }, { status: 500 });
  }
}

const reversalInput = z.object({ replacement_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) });
export async function DELETE(request: Request, { params }: Params) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  const parsed = reversalInput.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Enter a reason to undo this replacement." }, { status: 400 });
  try {
    const { error } = await createServiceClient().rpc("mem_admin_reverse_attendee_replacement", {
      p_booking_id: id, p_replacement_id: parsed.data.replacement_id,
      p_staff_user_id: admin.id, p_reason: parsed.data.reason,
    });
    if (error) {
      if (error.message.includes("mem_replacement_")) return NextResponse.json({ error: "This booking changed. Refresh the register before undoing its replacement." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reverse attendee replacement failed", error);
    return NextResponse.json({ error: "Could not undo the replacement." }, { status: 500 });
  }
}
