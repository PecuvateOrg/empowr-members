// POST /api/admin/private-bookings/[id]/guests — staff put a guest's child on
// a birthday party register when the family added the child and signed the
// waiver but never finished registering (#194).
//
// Staff choose the child explicitly; nothing is matched automatically. The
// place goes through the same joinPrivateBooking() a guest uses, on the
// child's OWN family account, so it needs that family's own valid waiver and
// obeys the same capacity, duplicate and start-time rules. Admin only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { joinPrivateBooking } from "@/lib/private-join";
import { EQUIPMENT, HIRE_SIZES } from "@/lib/private-bookings";

const bodySchema = z
  .object({
    participant_id: z.string().uuid(),
    equipment: z.enum(EQUIPMENT),
    hire_size: z.enum(HIRE_SIZES).optional(),
  })
  .refine((p) => p.equipment !== "hire" || p.hire_size !== undefined, { message: "Choose a hire size" });

const FAILED = "Could not add the skater — please try again.";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "We couldn’t find that party." }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const service = createServiceClient();

  const [{ data: booking, error: bookingError }, { data: participant, error: participantError }] =
    await Promise.all([
      service.from("mem_private_bookings").select("id").eq("id", id).eq("kind", "birthday").maybeSingle(),
      service
        .from("mem_participants")
        .select("id, name, dob, person_id, account_id, account:mem_accounts(user_id)")
        .eq("id", input.participant_id)
        .maybeSingle(),
    ]);
  if (bookingError || participantError) {
    console.error("party guest add read failed", id, bookingError ?? participantError);
    return NextResponse.json({ error: FAILED }, { status: 500 });
  }
  if (!booking) return NextResponse.json({ error: "We couldn’t find that party." }, { status: 404 });
  if (!participant) return NextResponse.json({ error: "We couldn’t find that skater." }, { status: 404 });

  const userId = (participant.account as unknown as { user_id: string } | null)?.user_id ?? "";
  const { data: authUser, error: authError } = await service.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (authError || !email) {
    console.error("party guest add email lookup failed", participant.account_id, authError);
    return NextResponse.json({ error: "Couldn’t check that family’s waiver — please try again." }, { status: 500 });
  }

  const joined = await joinPrivateBooking(service, {
    bookingId: booking.id,
    accountId: participant.account_id,
    accountEmail: email,
    participant,
    equipment: input.equipment,
    hireSize: input.equipment === "hire" ? input.hire_size ?? null : null,
    isBirthdayPerson: false,
  });
  if (!joined.ok) {
    const error =
      joined.error === "waiver_required"
        ? `${participant.name} has no signed waiver from their own family yet, so they can’t be added.`
        : joined.error;
    return NextResponse.json({ error }, { status: joined.status });
  }
  console.info("party guest added by staff", { booking: booking.id, participant: participant.id, by: admin.id });
  return NextResponse.json({ place: joined.place }, { status: 201 });
}
