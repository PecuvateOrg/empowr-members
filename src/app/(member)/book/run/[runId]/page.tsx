import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { getAuthedAccount } from "@/lib/auth";
import {
  getBookableCourseRun,
  listBookingParticipants,
} from "@/lib/booking";
import { formatAgeRange, formatDate, formatPrice } from "@/lib/format";
import { BookingForm } from "@/components/booking/BookingForm";
import { PolicyNotice } from "@/components/catalogue/PolicyNotice";
import { parseISO } from "date-fns";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Book a course — Empowr Members" };

export default async function BookCourseRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  // Independent reads — see the note on the per-occurrence booking page.
  const [authed, run] = await Promise.all([
    getAuthedAccount(),
    getBookableCourseRun(runId),
  ]);
  if (!authed) redirect(`/login?next=/book/run/${runId}`);
  if (!run) notFound();
  const offering = run.offering;
  const pricePence = run.price_pence ?? offering.price_pence;
  // Age eligibility is judged on the course start date (today if open-ended).
  const startDate = run.starts_on ? parseISO(run.starts_on) : new Date();

  const participants = await listBookingParticipants(
    { id: authed.account.id, email: authed.user.email ?? "" },
    offering,
    startDate
  );

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
          {run.label}
          {run.starts_on && run.ends_on && (
            <span className="font-semibold text-mid">
              {formatDate(run.starts_on)} – {formatDate(run.ends_on)}
            </span>
          )}
        </p>
        {offering.venue && (
          <p className="flex items-center gap-2 text-sm font-semibold text-mid">
            <MapPin className="h-4 w-4 text-blue" aria-hidden />
            {[
              offering.venue.name,
              offering.venue.address,
              offering.venue.postcode,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        <p className="text-sm font-semibold text-mid">
          {formatPrice(pricePence)} per place for the full course ·{" "}
          {formatAgeRange(offering.age_min, offering.age_max)}
        </p>
      </div>

      <section className="mt-6 rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">
          Who&apos;s coming?
        </h2>
        <div className="mt-4">
          <BookingForm
            target={{ course_run_id: run.id }}
            participants={participants}
            pricePence={pricePence}
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
