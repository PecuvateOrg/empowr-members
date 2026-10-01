// POST /api/private-bookings — hold a private interval and start Stripe
// Checkout. Signed-in members only: the hold starts after sign-in so an
// anonymous visitor cannot lock out a Saturday.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { privateBookingRequestSchema } from "@/lib/private-bookings";
import { createPrivateBookingCheckout } from "@/lib/private-bookings-server";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = privateBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  return createPrivateBookingCheckout(request, authed, parsed.data);
}
