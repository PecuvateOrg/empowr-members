// POST /api/participants — add a participant to the signed-in
// member's household. Service-client write scoped to the caller's
// account id.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { participantSchema } from "@/lib/validation";
import { composeRelationship, sameName } from "@/lib/ec-relationships";
import { digitsOnly } from "@/lib/waivers";
import { syncBrevoForAccount } from "@/lib/brevo";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

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
    .insert({ ...row, account_id: authed.account.id })
    .select()
    .single();

  if (error) {
    console.error("participant insert failed", error);
    return NextResponse.json(
      { error: "Could not add the participant — please try again." },
      { status: 500 }
    );
  }

  if (authed.user.email) {
    await syncBrevoForAccount({
      service,
      accountId: authed.account.id,
      email: authed.user.email,
      marketingConsent:
        authed.user.user_metadata.email_marketing_opt_in === true,
    });
  }

  return NextResponse.json({ participant: data }, { status: 201 });
}
