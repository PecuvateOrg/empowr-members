// POST /api/account/deletion/cancel — "Keep my account", from any of the emails. No sign-in: the
// member is locked out during the grace period, so the signed link is the authority.
import { NextResponse } from "next/server";
import { z } from "zod";
import { endDeletion } from "@/lib/account-deletion";

const schema = z.object({ id: z.string().uuid(), t: z.string().min(10).max(100) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  try {
    const result = await endDeletion(parsed.data.id, { member: true, token: parsed.data.t });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === "closed" ? "Your account has already been deleted, so it can't be restored." : "This link is not valid." },
        { status: 410 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("account deletion cancel failed", parsed.data.id, err);
    return NextResponse.json({ error: "Something went wrong. Please try again, or contact us." }, { status: 500 });
  }
}
