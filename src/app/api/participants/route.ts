// POST /api/participants — add a participant to the signed-in
// member's household. Service-client write scoped to the caller's
// account id.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { participantSchema } from "@/lib/validation";
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

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_participants")
    .insert({ ...parsed.data, account_id: authed.account.id })
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
