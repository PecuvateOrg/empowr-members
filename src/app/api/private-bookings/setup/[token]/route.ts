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
  if (error) return NextResponse.json({ error: paidPartyError(error.message) ?? "Could not set up the party. Please try again." }, { status: paidPartyError(error.message) ? 409 : 500 });
  return NextResponse.json({ ok: true });
}
