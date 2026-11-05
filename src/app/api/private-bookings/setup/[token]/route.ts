import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { paidPartyToken, paidPartyError } from "@/lib/paid-party-registration";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Please sign in or create an account." }, { status: 401 });
  const { token } = await params;
  if (!paidPartyToken.safeParse(token).success) return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  const { error } = await createServiceClient().rpc("mem_claim_paid_party", { p_token: token, p_account_id: authed.account.id });
  if (error) {
    const message = paidPartyError(error.message);
    // Log only a validated database error code: messages/details may contain
    // customer data, and the setup token must never be logged here.
    if (!message) console.error("paid_party_claim_failed", {
      code: /^[A-Z0-9]{5,12}$/.test(error.code ?? "") ? error.code : "unknown",
    });
    return NextResponse.json({ error: message ?? "Could not set up the party. Please try again." }, { status: message ? 409 : 500 });
  }
  return NextResponse.json({ ok: true });
}
