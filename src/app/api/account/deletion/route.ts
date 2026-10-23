// POST /api/account/deletion — the signed-in member asks to delete their account. Nothing changes
// until they confirm from the emailed link (lib/account-deletion.ts).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAccount } from "@/lib/auth";
import { DELETION_REASONS, requestDeletion } from "@/lib/account-deletion";

const schema = z.object({
  reason: z.enum(DELETION_REASONS).nullable(),
  detail: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!authed.user.email) return NextResponse.json({ error: "Your account has no email address to confirm with. Please contact us." }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await requestDeletion(authed.account, authed.user.email, parsed.data.reason, parsed.data.detail ?? null);
    return NextResponse.json({ ok: true, alreadyOpen: result.alreadyOpen });
  } catch (err) {
    console.error("account deletion request failed", authed.account.id, err);
    return NextResponse.json({ error: "We couldn't send the confirmation email. Please try again." }, { status: 500 });
  }
}
