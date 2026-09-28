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
      // Only pass credit through when the member asked for it. The amount is
      // theirs to propose and the database's to agree — see bookingBasketSchema.
      credit: parsed.data.use_credit
        ? { expectedPence: parsed.data.expected_credit_pence }
        : undefined,
    });
  }
  // The single-target path takes no credit. It is reachable only if
  // BOOKING_FORM_SHOWS_PAY_NOW is turned back on (booking-payment.ts); the
  // basket is the member's only live checkout, so credit is offered there.
  return createBookingCheckout(request, authed, [parsed.data]);
}
