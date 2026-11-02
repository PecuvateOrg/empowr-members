import { NextResponse } from "next/server";
import { getAuthedAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { offerTokenSchema } from "@/lib/private-offers";
import { createPrivateBookingCheckout } from "@/lib/private-bookings-server";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const authed = await getAuthedAccount();
  if (!authed) return NextResponse.json({ error: "Please sign in or create an account." }, { status: 401 });
  const { token } = await params;
  if (!offerTokenSchema.safeParse(token).success) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  const { data: offer, error } = await createServiceClient().from("mem_private_offers")
    .select("starts_at, paid_places, expires_at").eq("token", token).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not read the offer. Please try again." }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  // All booking choices come from the staff offer, never the request body.
  return createPrivateBookingCheckout(request, authed, {
    kind: "birthday", starts_at: offer.starts_at, hours: 2, paid_places: offer.paid_places, places: [],
  }, { token, expires_at: offer.expires_at, starts_at: offer.starts_at });
}
