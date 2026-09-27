// POST /api/private-bookings/join — a birthday guest registers one of their
// own participants onto a party through the host's invite link.
//
// Each guest acts on their own account and pays nothing, so the waiver check
// is the ordinary single-account one against the GUEST's email. The token is
// resolved server-side; the guest never sees anything about the host's
// payment.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWaivers, persistWaiverMatches } from "@/lib/waivers";
import { privateJoinSchema, privateRpcRefusal } from "@/lib/private-bookings";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = privateJoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const service = createServiceClient();

  const { data: booking, error: bookingError } = await service
    .from("mem_private_bookings")
    .select("id")
    .eq("invite_token", input.token)
    .eq("kind", "birthday")
    .maybeSingle();
  if (bookingError) {
    console.error("private join: booking read failed", bookingError);
    return NextResponse.json({ error: "Could not register — please try again." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "This invitation link isn’t valid." }, { status: 404 });
  }

  const { data: participant, error: participantError } = await service
    .from("mem_participants")
    .select("id, name, dob, person_id")
    .eq("id", input.participant_id)
    .eq("account_id", authed.account.id)
    .maybeSingle();
  if (participantError) {
    console.error("private join: participant read failed", participantError);
    return NextResponse.json({ error: "Could not register — please try again." }, { status: 500 });
  }
  if (!participant) {
    return NextResponse.json({ error: "That skater isn’t on your account." }, { status: 400 });
  }

  const [waiver] = await checkWaivers(authed.user.email ?? "", [participant]);
  await persistWaiverMatches(waiver ? [waiver] : [], [participant]);
  if (!waiver?.signed) {
    return NextResponse.json(
      { error: "waiver_required", unsigned: [{ id: participant.id, name: participant.name }] },
      { status: 409 }
    );
  }

  const { data: place, error } = await service.rpc("mem_join_private_booking", {
    p_booking_id: booking.id,
    p_account_id: authed.account.id,
    p_participant_id: participant.id,
    p_equipment: input.equipment,
    p_hire_size: input.equipment === "hire" ? input.hire_size ?? null : null,
    p_is_birthday_person: input.is_birthday_person,
  });
  if (error) {
    const refusal = privateRpcRefusal(error.message);
    if (refusal) return NextResponse.json({ error: refusal.message }, { status: refusal.status });
    console.error("private join failed", error);
    return NextResponse.json({ error: "Could not register — please try again." }, { status: 500 });
  }
  return NextResponse.json({ place }, { status: 201 });
}
