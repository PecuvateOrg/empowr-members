import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { getAuthedAccount } from "@/lib/auth";
import {
  getBookableOccurrence,
  listBookingParticipants,
} from "@/lib/booking";
import { earlyBirdAvailability, earlyBirdOffer } from "@/lib/catalogue";
import { formatAgeRange, formatOccurrence, formatPrice } from "@/lib/format";
import { BookingForm } from "@/components/booking/BookingForm";
import { PolicyNotice } from "@/components/catalogue/PolicyNotice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Book a session — Empowr Members" };

export default async function BookOccurrencePage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;

  // Independent reads, so they overlap rather than queue. Resolving the
  // account and loading the occurrence share no inputs; run serially they
  // cost two round trips back to back on a page that already makes
  // several. The guards below still run in the original order, so an
  // unauthenticated visitor is still bounced to login rather than shown
  // a not-found.
  const [authed, occurrence] = await Promise.all([
    getAuthedAccount(),
    getBookableOccurrence(occurrenceId),
  ]);
  if (!authed) redirect(`/login?next=/book/${occurrenceId}`);
  if (!occurrence) notFound();
  const offering = occurrence.offering;
  const venue = occurrence.venue ?? offering.venue;

  const participants = await listBookingParticipants(
    { id: authed.account.id, email: authed.user.email ?? "" },
    offering,
    new Date(occurrence.starts_at),
    { offering_id: offering.id, starts_at: occurrence.starts_at }
  );

  // Degrades to "no early bird" on a failed read rather than 404ing the
  // booking page over a discount — and that is the safe direction: showing
  // the standard price is always honourable, where showing a cheaper one
  // the server might refuse is not. Same pattern the session page uses
  // around its capacity counters.
  let earlyBird: { pricePence: number; remaining: number } | null = null;
  try {
    const availability = await earlyBirdAvailability([occurrence.id]);
    earlyBird = earlyBirdOffer(availability.get(occurrence.id));
  } catch (error) {
    console.error("early bird read failed", occurrence.id, error);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href={`/sessions/${offering.slug}`}
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {offering.title}
      </Link>

      <h1 className="mt-5 text-3xl font-black tracking-tight text-black">
        Book: {offering.title}
      </h1>

      <div className="mt-4 space-y-1.5 rounded-2xl bg-card p-5 shadow-sm">
        <p className="flex items-center gap-2 font-bold text-black">
          <CalendarDays className="h-4 w-4 text-blue" aria-hidden />
          {formatOccurrence(occurrence.starts_at, occurrence.ends_at)}
        </p>
        {venue && (
          <p className="flex items-center gap-2 text-sm font-semibold text-mid">
            <MapPin className="h-4 w-4 text-blue" aria-hidden />
            {[venue.name, venue.address, venue.postcode]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        <p className="text-sm font-semibold text-mid">
          {formatPrice(offering.price_pence)} per place ·{" "}
          {formatAgeRange(offering.age_min, offering.age_max)}
        </p>
        {earlyBird && (
          <p className="text-sm font-bold text-blue-dark">
            Early bird {formatPrice(earlyBird.pricePence)} —{" "}
            {earlyBird.remaining} left
          </p>
        )}
      </div>

      <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">
          Who&apos;s coming?
        </h2>
        <div className="mt-4">
          <BookingForm
            target={{ occurrence_id: occurrence.id }}
            participants={participants}
            pricePence={offering.price_pence}
            earlyBird={earlyBird}
            ageLabel={formatAgeRange(
              offering.age_min,
              offering.age_max
            ).toLowerCase()}
          />
        </div>
      </section>

      <div className="mt-6">
        <PolicyNotice refundPolicy={offering.refund_policy} />
      </div>
    </main>
  );
}
