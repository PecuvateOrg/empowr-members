// POST /api/bookings — immediate checkout for one target, or one atomic
// checkout for { items: [...] }. The common service keeps every validation
// gate identical whichever button the member used.
import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { bookingBasketSchema, bookingSchema } from "@/lib/validation";
import { createBookingCheckout } from "@/lib/booking-checkout";

export async function POST(request: Request) {
  const authed = await getAuthedAccount();
  if (!authed) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = body && typeof body === "object" && "items" in body
    ? bookingBasketSchema.safeParse(body)
    : bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  if ("items" in parsed.data) {
    return createBookingCheckout(request, authed, parsed.data.items, {
      fromBasket: true,
    });
  }
  return createBookingCheckout(request, authed, [parsed.data]);
}
