import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Backpack, CalendarDays, MapPin } from "lucide-react";
import {
  TYPE_LABELS_SINGULAR,
  getOffering,
  listCourseRuns,
  listOfferings,
  listUpcomingOccurrences,
  type CatalogueCourseRun,
  type CatalogueOccurrence,
  type CatalogueOffering,
} from "@/lib/catalogue";
import {
  formatAgeRange,
  formatDate,
  formatOccurrence,
  formatPrice,
} from "@/lib/format";
import { PolicyNotice } from "@/components/catalogue/PolicyNotice";

// Statically rendered and revalidated, not force-dynamic: this page reads
// only cached catalogue data through the cookie-free public client, so it
// has no per-request input and can be served from the CDN. Admin writes
// drop it immediately via revalidateCatalogue(); the window below is the
// backstop. Unknown slugs still render on demand.
export const revalidate = 300;

/** Prerender the active catalogue at build time. Without this Next has no
 *  slug list for the segment and falls back to rendering every visit on
 *  demand, which is what revalidate alone could not fix. Slugs added
 *  later still work — dynamicParams defaults to true, so an unknown slug
 *  renders once and is then cached like the rest.
 *
 *  Fails open on purpose: a build should never break because the database
 *  was briefly unreachable. An empty list just means every page waits for
 *  its first visitor instead of being ready in advance. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const offerings = await listOfferings({});
    return offerings.map((offering) => ({ slug: offering.slug }));
  } catch (error) {
    console.error("generateStaticParams for /sessions/[slug] failed", error);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const offering = await getOffering(slug);
  if (!offering) return { title: "Session not found — Empowr Members" };
  return {
    title: `${offering.title} — Empowr Members`,
    description: offering.description ?? undefined,
  };
}

export default async function OfferingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const offering = await getOffering(slug);
  if (!offering) notFound();

  const [occurrences, courseRuns] = await Promise.all([
    listUpcomingOccurrences(offering.id),
    offering.enrolment_scope === "per_run"
      ? listCourseRuns(offering.id)
      : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/sessions"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All sessions
      </Link>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-bold text-blue-dark">
          {TYPE_LABELS_SINGULAR[offering.type]}
        </span>
        <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-bold text-red-dark">
          {formatAgeRange(offering.age_min, offering.age_max)}
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-black">
        {offering.title}
      </h1>
      {offering.description && (
        <p className="mt-2 max-w-2xl leading-relaxed text-mid">
          {offering.description}
        </p>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_280px]">
        <section className="space-y-6">
          {offering.enrolment_scope === "per_run" ? (
            <CourseRunList
              offering={offering}
              courseRuns={courseRuns}
              occurrences={occurrences}
            />
          ) : (
            <OccurrenceList offering={offering} occurrences={occurrences} />
          )}
          <PolicyNotice refundPolicy={offering.refund_policy} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              Price
            </h2>
            <p className="mt-1 text-2xl font-black text-blue">
              {formatPrice(offering.price_pence)}
              <span className="text-sm font-bold text-mid">
                {offering.enrolment_scope === "per_run"
                  ? " / course"
                  : " online"}
              </span>
            </p>
            {offering.early_bird_price_pence !== null && (
              <p className="mt-1 text-sm font-semibold text-mid">
                Early bird {formatPrice(offering.early_bird_price_pence)}
              </p>
            )}
            {offering.walk_in_price_pence !== null && (
              <p className="mt-0.5 text-sm font-semibold text-mid">
                On the door {formatPrice(offering.walk_in_price_pence)}
              </p>
            )}
          </div>

          {offering.venue && (
            <div className="rounded-2xl bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
                <MapPin className="h-4 w-4" aria-hidden /> Venue
              </h2>
              <p className="mt-1 font-extrabold text-black">
                {offering.venue.name}
              </p>
              {(offering.venue.address || offering.venue.postcode) && (
                <p className="text-sm text-mid">
                  {[offering.venue.address, offering.venue.postcode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {offering.kit_list && (
            <div className="rounded-2xl bg-card p-5 shadow-sm">
              <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
                <Backpack className="h-4 w-4" aria-hidden /> What to bring
              </h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-mid">
                {offering.kit_list}
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function OccurrenceList({
  offering,
  occurrences,
}: {
  offering: CatalogueOffering;
  occurrences: CatalogueOccurrence[];
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <CalendarDays className="h-5 w-5 text-blue" aria-hidden /> Upcoming
        dates
      </h2>
      {occurrences.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-mid">
          No upcoming dates just yet — check back soon.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {occurrences.map((occurrence) => (
            <li
              key={occurrence.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-bold text-black">
                  {formatOccurrence(occurrence.starts_at, occurrence.ends_at)}
                </p>
                {occurrence.venue &&
                  occurrence.venue.id !== offering.venue?.id && (
                    <p className="text-sm font-semibold text-muted">
                      <MapPin
                        className="mr-1 inline h-3.5 w-3.5"
                        aria-hidden
                      />
                      {occurrence.venue.name}
                    </p>
                  )}
              </div>
              <Link
                href={`/book/${occurrence.id}`}
                className="shrink-0 rounded-full bg-blue px-5 py-3 text-sm font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
              >
                Book
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseRunList({
  offering,
  courseRuns,
  occurrences,
}: {
  offering: CatalogueOffering;
  courseRuns: CatalogueCourseRun[];
  occurrences: CatalogueOccurrence[];
}) {
  return (
    <div className="space-y-4">
      {courseRuns.length === 0 && (
        <p className="rounded-2xl bg-card p-6 text-sm font-semibold text-mid shadow-sm">
          No upcoming intakes just yet — check back soon.
        </p>
      )}
      {courseRuns.map((run) => {
        const runOccurrences = occurrences.filter(
          (o) => o.course_run_id === run.id
        );
        return (
          <div key={run.id} className="rounded-2xl bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-black">
                  {run.label}
                </h2>
                {run.starts_on && run.ends_on && (
                  <p className="text-sm font-semibold text-mid">
                    {formatDate(run.starts_on)} – {formatDate(run.ends_on)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-black text-blue">
                  {formatPrice(run.price_pence ?? offering.price_pence)}
                </span>
                <Link
                  href={`/book/run/${run.id}`}
                  className="rounded-full bg-blue px-5 py-3 text-sm font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
                >
                  Book this course
                </Link>
              </div>
            </div>
            {runOccurrences.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm font-semibold text-mid">
                {runOccurrences.map((occurrence) => (
                  <li key={occurrence.id}>
                    {formatOccurrence(
                      occurrence.starts_at,
                      occurrence.ends_at
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
