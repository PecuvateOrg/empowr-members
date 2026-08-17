// POST /api/waivers — record an in-app waiver for the signed-in member's
// participants (Phase 1). Writes the same people + waiver_responses shape
// as the standalone app at waiver.empowrcic.org, which stays the public
// route for walk-ins. Participant ownership is re-checked inside
// submitWaiver() against the authed account, so ids from the body are
// never trusted.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { waiverSchema } from "@/lib/validation";
import { submitWaiver } from "@/lib/waivers";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // checkWaivers() finds signers by auth email, so a waiver signed against
  // any other address would be invisible to the booking gate.
  const email = authed.user.email;
  if (!email) {
    return NextResponse.json(
      { error: "Your account has no email address — contact us to fix this." },
      { status: 400 }
    );
  }

  const parsed = waiverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const result = await submitWaiver({
    accountId: authed.account.id,
    accountName: authed.account.name,
    email,
    participantIds: parsed.data.participant_ids,
    emergencyContactName: parsed.data.emergency_contact_name,
    emergencyContactPhone: parsed.data.emergency_contact_phone,
    emergencyContactRelationship: parsed.data.emergency_contact_relationship,
    agreedPhoto: parsed.data.agreed_photo,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, covered: result.covered },
    { status: 201 }
  );
}
