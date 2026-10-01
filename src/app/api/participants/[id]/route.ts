// PATCH / DELETE /api/participants/[id] — edit or remove a household
// participant. Every query is scoped to both the participant id AND the
// caller's account id, so one member can never touch another's rows.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { participantSchema } from "@/lib/validation";
import { composeRelationship, sameName } from "@/lib/ec-relationships";
import { digitsOnly } from "@/lib/waivers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = participantSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // The contact cannot be the skater: when the skater is the account holder,
  // their own number is not an emergency contact (staff would ring the
  // phone in the injured person's pocket).
  const { emergency_contact_relationship_other, ...fields } = parsed.data;
  const selfPhone = digitsOnly(authed.account.phone);
  if (
    sameName(fields.name, authed.account.name) &&
    selfPhone &&
    digitsOnly(fields.emergency_contact_phone) === selfPhone
  ) {
    return NextResponse.json(
      { error: "The emergency contact must be someone other than you — please give another person's number." },
      { status: 400 }
    );
  }
  const row = {
    ...fields,
    emergency_contact_relationship: composeRelationship(
      fields.emergency_contact_relationship,
      emergency_contact_relationship_other
    ),
  };

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_participants")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", authed.account.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("participant update failed", error);
    return NextResponse.json(
      { error: "Could not save the participant — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({ participant: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_participants")
    .delete()
    .eq("id", id)
    .eq("account_id", authed.account.id)
    .select("id")
    .maybeSingle();

  if (error) {
    // FK violation once bookings exist — participants with booking
    // history can't be hard-deleted.
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This participant has bookings, so they can't be removed. Contact us if you need help.",
        },
        { status: 409 }
      );
    }
    console.error("participant delete failed", error);
    return NextResponse.json(
      { error: "Could not remove the participant — please try again." },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
