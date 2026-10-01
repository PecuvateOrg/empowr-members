// POST /api/private-bookings/[id]/add — the host adds skaters to a confirmed
// birthday party or group coaching booking and pays for them through Stripe.
// Closes 48 hours before the start; after that, staff add at the door.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { privateTopupRequestSchema } from "@/lib/private-bookings";
import { createPrivateTopupCheckout } from "@/lib/private-bookings-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "We couldn’t find that booking." }, { status: 404 });
  }

  const parsed = privateTopupRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  return createPrivateTopupCheckout(request, authed, id, parsed.data);
}
