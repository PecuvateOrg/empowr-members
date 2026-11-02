import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthedAccount } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { equipmentDeadline, formatPrivateSlot, PRIVATE_TERMS } from "@/lib/private-bookings";
import { offerTokenSchema, offerDeadline, OFFER_LATE_HIRE_MESSAGE } from "@/lib/private-offers";
import { PrivateOfferCheckout } from "@/components/private-bookings/PrivateOfferCheckout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your birthday party offer", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PrivateOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!offerTokenSchema.safeParse(token).success) notFound();
  const service = createServiceClient();
  const { data: offer, error } = await service.from("mem_private_offers")
    .select("starts_at, paid_places, price_pence, expires_at, booking_id, venue:mem_venues(name, address, postcode)")
    .eq("token", token).maybeSingle();
  if (error) throw new Error("private_offer_read_failed");
  if (!offer) notFound();
  const authed = await getAuthedAccount();
  let booked = false;
  let ownedBooking: string | null = null;
  if (offer.booking_id) {
    const result = await service.from("mem_private_bookings").select("status, host_account_id")
      .eq("id", offer.booking_id).maybeSingle();
    if (result.error) throw new Error("private_offer_booking_read_failed");
    booked = result.data?.status === "confirmed";
    if (booked && result.data?.host_account_id === authed?.account.id) ownedBooking = offer.booking_id;
  }
  const expired = Math.min(Date.parse(offer.expires_at), Date.parse(offer.starts_at)) <= Date.now();
  const lateHire = Date.parse(offer.starts_at) - 7 * 86400000 <= Date.now();
  const next = encodeURIComponent(`/private-bookings/offer/${token}`);
  const venue = offer.venue as unknown as { name: string; address: string | null; postcode: string | null } | null;
  return <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-black text-black">Your birthday party offer</h1>
    <section className="space-y-4 rounded-2xl bg-card p-6 shadow-sm">
      <p className="text-xl font-extrabold">{formatPrivateSlot(offer.starts_at, new Date(Date.parse(offer.starts_at) + 2 * 3600000).toISOString())}</p>
      {venue && <p>{[venue.name, venue.address, venue.postcode].filter(Boolean).join(", ")}</p>}
      <p>{offer.paid_places} paid places + 1 free birthday place</p>
      <p className="text-2xl font-black">{formatPrice(offer.price_pence)}</p>
      <p>Pay by <strong>{offerDeadline(offer.expires_at)}</strong>. This link lasts 48 hours from creation. The date is not reserved until you start checkout.</p>
      <p>Start checkout at least 31 minutes before the payment deadline or party start, whichever is earlier. Payment confirms your booking.</p>
      <p>Skate sizes are due <strong>{equipmentDeadline(offer.starts_at, 7)}</strong>, one week before the party.</p>
      {lateHire && <p role="note" className="font-bold text-red-dark">{OFFER_LATE_HIRE_MESSAGE}</p>}
      <p>{PRIVATE_TERMS}</p>
      {booked ? <p>This offer has been booked. {ownedBooking && <Link className="font-bold underline" href={`/private-bookings/${ownedBooking}`}>View your booking</Link>}</p>
        : expired ? <p role="alert">This offer has expired. Please contact Empowr.</p>
        : authed ? <PrivateOfferCheckout token={token} />
        : <div className="space-y-3"><p>Sign in or create a free account to continue to payment. Your party details will be kept.</p>
          <div className="flex flex-wrap gap-4"><Link className="rounded-full bg-blue px-5 py-3 font-bold text-white" href={`/login?next=${next}`}>Sign in</Link>
          <Link className="rounded-full border border-blue px-5 py-3 font-bold text-blue" href={`/signup?next=${next}`}>Create an account</Link></div></div>}
    </section>
  </main>;
}
