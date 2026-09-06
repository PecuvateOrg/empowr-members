import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Backpack, CalendarDays, Clock, MapPin } from "lucide-react";
import {
  TYPE_LABELS_SINGULAR,
  getOffering,
  listCourseRuns,
  listOfferings,
  listUpcomingOccurrences,
  occurrenceCapacities,
  courseRunCapacities,
  earlyBirdAvailability,
  earlyBirdOffer,
  type CapacityInfo,
  type CatalogueCourseRun,
  type CatalogueOccurrence,
  type CatalogueOffering,
} from "@/lib/catalogue";
import {
  formatAgeRange,
  formatDate,
  formatLocalTime,
  formatOccurrence,
  formatPrice,
} from "@/lib/format";
import { PolicyNotice } from "@/components/catalogue/PolicyNotice";
import {
  OccurrenceDates,
  PlacesRemaining,
  type OccurrenceRow,
} from "@/components/catalogue/OccurrenceDates";

// Statically rendered and revalidated, not force-dynamic: this page reads
// only cached catalogue data through the cookie-free public client, so it
// has no per-request input and can be served from the CDN. Admin writes
// drop it immediately via revalidateCatalogue(); the window below is the
// backstop. Unknown slugs still render on demand.
import {
  plansForOffering,
  type PlanWithEntitlements,
} from "@/lib/membership";
import { describeSlot } from "@/lib/slot-describe";
import { links } from "@/lib/links";
import { recentBookingCounts } from "@/lib/recent-bookings";

export const revalidate = 300;

/** Unknown and inactive slugs must 404, and only this makes them.
 *
 *  With dynamicParams left at its default of true, an unknown slug was
 *  rendered on demand, hit notFound(), and Next then STORED that not-found
 *  render as a prerendered page — served ever after with HTTP 200. The page
 *  looked right (correct copy, noindex) and the status lied. Confirmed as app
 *  behaviour rather than a CDN artefact: a local `next start` reproduced it
 *  exactly, while an unknown top-level route 404'd correctly on both.
 *
 *  Setting it false makes the router reject any slug outside
 *  generateStaticParams() before rendering, which is a real 404 and keeps the
 *  page fully static.
 *
 *  THE COST: the slug set is now frozen at build time. A slug that becomes
 *  active after the build has no page — and revalidateCatalogue() cannot fix
 *  that, because revalidation re-renders existing params, it never adds new
 *  ones. /sessions would list a session that 404s when clicked. That is why
 *  triggerCatalogueRebuild() exists in lib/rebuild.ts and is wired into the
 *  admin offering routes: whenever the set of active slugs changes, the site
 *  rebuilds. Do not remove one without removing the other. */
export const dynamicParams = false;

/** Prerender the active catalogue at build time. Without this Next has no
 *  slug list for the segment and falls back to rendering every visit on
 *  demand, which is what revalidate alone could not fix.
 *
 *  This list IS the set of pages that exist. `dynamicParams = false` above
 *  means anything absent from it is a hard 404, so a slug activated after
 *  the build has no page until the site rebuilds — see that comment, and
 *  triggerCatalogueRebuild() in lib/rebuild.ts.
 *
 *  DELIBERATELY NOT CAUGHT. This used to swallow the error and return [],
 *  reasoning that a build should never break because the database was
 *  briefly unreachable. That was correct while dynamicParams was true: an
 *  empty list only meant pages rendered on demand instead of ahead of time.
 *
 *  Setting dynamicParams = false inverted it. An empty list now means every
 *  /sessions/[slug] is a hard 404 until the next rebuild — and because the
 *  error was swallowed, the deploy went GREEN while the entire catalogue
 *  was dead. One unlucky build would have done it, with nothing to show
 *  that anything was wrong.
 *
 *  A failed build is loud and recoverable; a green deploy serving 404s for
 *  every session is neither. So this throws.
 *
 *  An empty result from a SUCCESSFUL query is left alone on purpose: no
 *  active offerings genuinely means no pages to prerender, and /sessions
 *  renders its own empty state. Only a failure to ask is fatal. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const offerings = await listOfferings({});
  return offerings.map((offering) => ({ slug: offering.slug }));
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

  const [occurrences, courseRuns, plans] = await Promise.all([
    // Every scheduled date, not the default 30. The list is paged six at a
    // time now, so "Later" must keep working to the end of what is scheduled
    // rather than stopping at an arbitrary cap partway through the year.
    // listScheduledOccurrences() already loads and caches them all — this only
    // changes how many survive the slice, so the cost is markup, not a query.
    listUpcomingOccurrences(offering.id, 200),
    offering.enrolment_scope === "per_run"
      ? listCourseRuns(offering.id)
      : Promise.resolve([]),
    plansForOffering(offering.id),
  ]);

  // Capacity lives at whichever level the offering actually sells at: a
  // per_run course is sold as a whole block (its individual weekly dates
  // don't each have their own capacity), so only run-level counters are
  // fetched there; a per_occurrence session's capacity is per date.
  //
  // occurrenceCapacities()/courseRunCapacities() throw on a database error
  // (same as every other catalogue.ts read — see the comment there). This
  // is the ONE call site that catches it: a capacity counter is genuinely
  // optional, so a transient failure here degrades to "don't show it"
  // rather than 404ing a session page over a nice-to-have. Same pattern
  // lib/booking.ts already uses around coverForOccurrence().
  let capacities: Map<string, CapacityInfo> = new Map();
  try {
    capacities =
      offering.enrolment_scope === "per_run"
        ? await courseRunCapacities(courseRuns.map((r) => r.id))
        : await occurrenceCapacities(occurrences.map((o) => o.id));
  } catch (error) {
    console.error("session page capacity read failed", offering.id, error);
  }

  // This is separate from capacity: it reveals recent demand, never how many
  // tickets remain. The page revalidates every five minutes, so the rolling
  // 72-hour window stays current without making the route per-request dynamic.
  let recentBookings: Map<string, number> = new Map();
  try {
    recentBookings = await recentBookingCounts(
      offering.enrolment_scope === "per_run"
        ? { courseRunIds: courseRuns.map((run) => run.id) }
        : { occurrenceIds: occurrences.map((occurrence) => occurrence.id) }
    );
  } catch (error) {
    console.error("session page recent booking read failed", offering.id, error);
  }

  // The early bird allocation lives on the OCCURRENCE, while this sidebar
  // shows one price block for the whole offering — so it reports the soonest
  // upcoming date that still has tickets. `occurrences` is already ordered
  // ascending, so the first hit is that date.
  //
  // Not a total across every date: "10 left" spread over five events would
  // read as ten tickets for the one someone is looking at. Courses are
  // skipped entirely — mem_hold_bookings() refuses p_early_bird on the
  // course-run path, so there is nothing to advertise.
  //
  // Degrades to null on a failed read, which shows the sold-out line rather
  // than a price. That is the safe direction: understating availability
  // costs a booking, overstating it takes money for a ticket the server
  // would refuse.
  let earlyBird: { pricePence: number; remaining: number } | null = null;
  if (offering.enrolment_scope !== "per_run") {
    try {
      const availability = await earlyBirdAvailability(
        occurrences.map((o) => o.id)
      );
      for (const occurrence of occurrences) {
        const offer = earlyBirdOffer(availability.get(occurrence.id));
        if (offer) {
          earlyBird = offer;
          break;
        }
      }
    } catch (error) {
      console.error("session page early bird read failed", offering.id, error);
    }
  }

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
              capacities={capacities}
              recentBookings={recentBookings}
            />
          ) : (
            <OccurrenceList
              offering={offering}
              occurrences={occurrences}
              capacities={capacities}
              recentBookings={recentBookings}
            />
          )}
          <PolicyNotice refundPolicy={offering.refund_policy} />
        </section>

        <aside className="order-first space-y-4 md:order-none md:sticky md:top-6 md:self-start">
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
            {/* The early bird line now reports the allocation rather than
                just naming a price. It advertised "Early bird £10" for weeks
                while nothing in the booking flow could sell one — the price
                was a display-only column until 2026-09-02. Showing what is
                left is what makes the claim checkable. `earlyBird` is null
                whenever the tier is not really on offer (no allocation on any
                date, or all sold), so the line disappears rather than
                promising a ticket that cannot be bought. */}
            {earlyBird ? (
              <p className="mt-1 text-sm font-bold text-blue-dark">
                Early bird {formatPrice(earlyBird.pricePence)}
              </p>
            ) : (
              offering.early_bird_price_pence !== null && (
                <p className="mt-1 text-sm font-semibold text-muted">
                  Early bird {formatPrice(offering.early_bird_price_pence)} —
                  sold out
                </p>
              )
            )}
            {offering.walk_in_price_pence !== null && (
              <p className="mt-0.5 text-sm font-semibold text-mid">
                On the door {formatPrice(offering.walk_in_price_pence)}
              </p>
            )}
          </div>

          {plans.length > 0 && (
            <SubscribeOption offering={offering} plans={plans} />
          )}

          {/* Always rendered when a venue can be resolved at all, so the
              sidebar keeps the same shape between sessions. Some offerings
              carry no venue_id of their own (Roller Skate Events, Prep to
              Street Skate) and previously dropped this card entirely, which
              moved everything below it. */}
          <VenueCard offering={offering} occurrences={occurrences} />

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
  capacities,
  recentBookings,
}: {
  offering: CatalogueOffering;
  occurrences: CatalogueOccurrence[];
  capacities: Map<string, CapacityInfo>;
  recentBookings: Map<string, number>;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <CalendarDays className="h-5 w-5 text-blue" aria-hidden /> Upcoming
        dates
      </h2>
      {occurrences.length === 0 ? (
        <DatesComingSoon title={offering.title} />
      ) : (
        <OccurrenceDates
          rows={occurrenceRows(offering, occurrences, capacities, recentBookings)}
        />
      )}
    </div>
  );
}

function CourseRunList({
  offering,
  courseRuns,
  occurrences,
  capacities,
  recentBookings,
}: {
  offering: CatalogueOffering;
  courseRuns: CatalogueCourseRun[];
  occurrences: CatalogueOccurrence[];
  capacities: Map<string, CapacityInfo>;
  recentBookings: Map<string, number>;
}) {
  // Same outer card and heading as OccurrenceList on purpose. These two
  // render very different things — dated rows versus course intakes — but
  // they occupy the same slot on the same page, and having one produce a
  // titled card while the other produced a bare stack of unlabelled cards
  // made the page look restructured rather than repopulated when moving
  // between a weekly session and a course. The CONTENTS differ; the shell
  // must not.
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <CalendarDays className="h-5 w-5 text-blue" aria-hidden /> Upcoming
        courses
      </h2>
      <div className="mt-4 space-y-4">
      {courseRuns.length === 0 && (
        <DatesComingSoon title={offering.title} />
      )}
      {courseRuns.map((run) => {
        const runOccurrences = occurrences.filter(
          (o) => o.course_run_id === run.id
        );
        return (
          <div key={run.id} className="rounded-xl border border-line p-4">
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
                {/* A run's weekly meeting time. Its own line rather than
                    appended to the dates above, because that range is a
                    block boundary ("15 Sep – 6 Oct") while this is the
                    time you turn up each week — reading as one string
                    invites "6 Oct, 7:30pm". Absent when not stated, the
                    same way the dates are. */}
                {run.starts_at_local && run.ends_at_local && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-mid">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {formatLocalTime(run.starts_at_local)}–
                    {formatLocalTime(run.ends_at_local)}
                  </p>
                )}
                {/* Only set when the run differs from the offering — a course
                    spanning venues has no offering venue, so the page-level
                    venue block is absent and this is the only place it shows. */}
                {run.venue && (
                  <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-muted">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {[run.venue.name, run.venue.postcode]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <PlacesRemaining
                  capacity={capacities.get(run.id)?.capacity ?? null}
                  booked={capacities.get(run.id)?.booked ?? 0}
                  recentBookings={recentBookings.get(run.id) ?? 0}
                />
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
    </div>
  );
}

/**
 * The subscribe half of the choice, in the sidebar directly under the
 * per-session price so the two prices are read together.
 *
 * It used to sit below the dates, which put it under 57 rows on Sk8 Skool for
 * Kidz — the option that makes a long list of dates unnecessary was reachable
 * only by scrolling past all of them. Sticky on desktop so it survives that
 * scroll; the aside is ordered FIRST on mobile so prices precede the dates
 * there rather than trailing them.
 *
 * Anchored as #subscribe so EELA's "£X/month" cards link straight to it. Each
 * plan gets its own button through to /membership/[planId], where the
 * participant is chosen and Stripe takes over. Nothing is bought from this
 * page, so it stays public and cacheable.
 */
function SubscribeOption({
  offering,
  plans,
}: {
  offering: CatalogueOffering;
  plans: PlanWithEntitlements[];
}) {
  return (
    <div
      id="subscribe"
      className="scroll-mt-6 rounded-2xl border border-blue bg-blue-pale p-5"
    >
      <h2 className="text-sm font-bold uppercase tracking-wide text-blue-dark">
        Coming every week?
      </h2>
      <p className="mt-1 text-sm font-semibold text-blue-dark">
        Subscribe and your place is held every week — nothing to book, just
        turn up. Cancel any time.
      </p>
      <ul className="mt-4 space-y-3">
        {plans.map((plan) => (
          <li key={plan.id} className="rounded-xl bg-card p-4 shadow-sm">
            <p className="text-xl font-black text-blue">
              {formatPrice(plan.price_pence)}
              <span className="text-sm font-bold text-mid"> / month</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold text-mid">
              {plan.slots
                .map((slot) => describeSlot(slot, offering.title))
                .join(" · ")}
            </p>
            <Link
              href={`/membership/${plan.id}`}
              className="mt-3 block rounded-full bg-blue px-4 py-2.5 text-center text-sm font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
            >
              Subscribe
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Server-side row prep for OccurrenceDates. Formatting stays here — resolving
 *  a UK wall-clock time is lib/format's job and must not gain a second
 *  implementation in the browser. The venue only appears when it differs from
 *  the offering's usual one, which is the existing behaviour. */
function occurrenceRows(
  offering: CatalogueOffering,
  occurrences: CatalogueOccurrence[],
  capacities: Map<string, CapacityInfo>,
  recentBookings: Map<string, number>
): OccurrenceRow[] {
  return occurrences.map((occurrence) => ({
    id: occurrence.id,
    when: formatOccurrence(occurrence.starts_at, occurrence.ends_at),
    // EVERY row names its venue, resolving the occurrence's own first and
    // falling back to the offering's. The old rule showed one only when it
    // DIFFERED from the offering's usual venue, on the assumption the usual
    // one is stated once in the sidebar. That breaks on the session it
    // matters most for: Sk8 Skool for Kidz is Mondays at Goldsmiths and
    // Wednesdays at Honor Oak, so Wednesdays named a venue and Mondays
    // rendered blank — in a list where the venue is part of choosing a date.
    venueName: occurrence.venue?.name ?? offering.venue?.name ?? null,
    capacity: capacities.get(occurrence.id)?.capacity ?? null,
    booked: capacities.get(occurrence.id)?.booked ?? 0,
    recentBookings: recentBookings.get(occurrence.id) ?? 0,
  }));
}

/**
 * Venue for the sidebar, resolved offering-first then from the dates.
 *
 * An offering has no venue_id when its sessions are not all in one place, so
 * the card used to vanish on exactly those pages — the sidebar lost a whole
 * block and everything under it shifted, which read as the layout changing
 * between sessions. Falling back to the upcoming occurrences keeps the shape
 * steady AND is more informative: Roller Skate Events has no offering venue
 * but every scheduled date is at Nunhead Sports Ground.
 *
 * When the dates genuinely span venues, all of them are named rather than
 * picking the first — showing one would state something untrue about the rest.
 */
function VenueCard({
  offering,
  occurrences,
}: {
  offering: CatalogueOffering;
  occurrences: CatalogueOccurrence[];
}) {
  const fromDates = [
    ...new Map(
      occurrences
        .map((o) => o.venue)
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .map((v) => [v.id, v])
    ).values(),
  ];
  const venues = offering.venue ? [offering.venue] : fromDates;
  if (venues.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <MapPin className="h-4 w-4" aria-hidden /> Venue
      </h2>
      {venues.map((venue, i) => (
        <div key={venue.id} className={i > 0 ? "mt-3" : undefined}>
          <p className="mt-1 font-extrabold text-black">{venue.name}</p>
          {(venue.address || venue.postcode) && (
            <p className="text-sm text-mid">
              {[venue.address, venue.postcode].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Shown in place of the date rows when an offering has none scheduled.
 *
 * Roller Quad Camp and All Ages Roller Disco are real offerings with real
 * descriptions, prices and venues whose dates are simply not set yet, so they
 * get a page rather than a 404 and EELA can link to them. It doubles as the
 * empty state for an active session that has temporarily run out of dates —
 * the wording has to hold for both, which is why it says nothing about
 * whether the offering is new.
 *
 * ⚠️ STILL NO EMAIL INPUT HERE, AND THAT IS THE POINT. The link goes to
 * Brevo's own hosted form (links.mailingList), which owns the field, the
 * storage and the double opt-in. Nothing in this app touches an address, so
 * nothing here can accept one and drop it — the bug found on EELA's /members
 * page on 2026-09-01, where every "join the waitlist" submission was discarded
 * by a handler that only set local state. Replaced the interim mailto on
 * 2026-09-02 once the Brevo list existed. If this is ever changed to a native
 * form, the API route and list write must land in the SAME change.
 */
function DatesComingSoon({ title }: { title: string }) {
  return (
    <div className="mt-3">
      <p className="font-bold text-black">Dates coming soon</p>
      <p className="mt-1 text-sm leading-relaxed text-mid">
        We are finalising times and dates for {title}. They will appear here as
        soon as they are confirmed, and you will be able to book from this
        page.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-mid">
        Want to hear first?{" "}
        <a
          href={links.mailingList}
          target="_blank"
          rel="noopener"
          className="font-bold text-blue underline"
        >
          Join our mailing list
        </a>{" "}
        and we will email you as soon as dates are announced.
      </p>
    </div>
  );
}
