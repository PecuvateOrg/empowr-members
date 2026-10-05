// GET /api/public/live-sessions
//
// Live state for every active offering — next dates, places left, whether
// each can be booked now, and where to book it — for EELA's session pages and
// agent map (agent navigation Phase 2). Public and read-only: counts and
// dates only, nothing about who booked. No query params, so Netlify's CDN
// cache key (which ignores query strings) cannot mix responses.
//
// ALL OR NOTHING. Any failed read returns 503 for the whole response, never a
// partial one: a missing offering reads to EELA as "Members dropped it", and a
// null capacity reads as "unlimited" — both false claims (see
// lib/catalogue-read.ts for the outage that rule came from).
//
// "Bookable" mirrors mem_hold_bookings(), which is what actually refuses a
// sale: an occurrence while scheduled, not yet started and not full; a course
// run until its last day (runs already under way still sell) and not full.
import { NextResponse } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";
import {
  courseRunCapacities,
  listCourseRuns,
  listOfferings,
  listUpcomingOccurrences,
  occurrenceCapacities,
  type CapacityInfo,
  type CatalogueOffering,
  type Venue,
} from "@/lib/catalogue";
import { membersUrl } from "@/lib/links";

export const dynamic = "force-dynamic";

// Kidz alone has ~47 upcoming dates; nobody reading a page needs more.
const MAX_DATES = 12;

const headers = {
  "Access-Control-Allow-Origin": "*",
  // Places left change with every booking — keep it short.
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

type LiveDate = {
  starts_at: string;
  ends_at: string | null;
  label: string | null; // course runs only, e.g. "Level 1 — Block 2"
  venue: string | null;
  places_left: number | null; // null = no limit set
  bookable: boolean;
  book_url: string;
};

const venueText = (v: Venue | null) =>
  v ? [v.name, v.address, v.postcode].filter(Boolean).join(", ") : null;

const placesLeft = (c: CapacityInfo | undefined) =>
  c && c.capacity !== null ? Math.max(0, c.capacity - c.booked) : null;

async function liveDates(offering: CatalogueOffering): Promise<LiveDate[]> {
  if (offering.enrolment_scope === "per_run") {
    const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
    const runs = (await listCourseRuns(offering.id))
      .filter((r) => r.starts_on && (r.ends_on === null || r.ends_on >= today))
      .slice(0, MAX_DATES);
    const caps = await courseRunCapacities(runs.map((r) => r.id));
    return runs.map((r) => {
      // A run holds a DATE plus a local wall-clock time; combine them in
      // London time, never UTC (BST ends 25 Oct).
      const at = (date: string, time: string | null) =>
        fromZonedTime(`${date}T${time ?? "00:00:00"}`, TIMEZONE).toISOString();
      const left = placesLeft(caps.get(r.id));
      return {
        starts_at: at(r.starts_on!, r.starts_at_local),
        ends_at: r.ends_on ? at(r.ends_on, r.ends_at_local) : null,
        label: r.label,
        venue: venueText(r.venue ?? offering.venue),
        places_left: left,
        bookable: left !== 0,
        book_url: membersUrl(`/book/run/${r.id}`),
      };
    });
  }

  const now = Date.now();
  const occurrences = (await listUpcomingOccurrences(offering.id, MAX_DATES)).filter(
    (o) => new Date(o.starts_at).getTime() > now
  );
  const caps = await occurrenceCapacities(occurrences.map((o) => o.id));
  return occurrences.map((o) => {
    const left = placesLeft(caps.get(o.id));
    return {
      starts_at: o.starts_at,
      ends_at: o.ends_at,
      label: null,
      venue: venueText(o.venue ?? offering.venue),
      places_left: left,
      bookable: left !== 0,
      book_url: membersUrl(`/book/${o.id}`),
    };
  });
}

export async function GET() {
  try {
    const offerings = await listOfferings({});
    const live = await Promise.all(
      offerings.map(async (o) => {
        const dates = await liveDates(o);
        return {
          slug: o.slug,
          title: o.title,
          scope: o.enrolment_scope,
          // Members' own prices, so EELA can check them against the KB.
          price_pence: o.price_pence,
          walk_in_price_pence: o.walk_in_price_pence,
          early_bird_price_pence: o.early_bird_price_pence,
          age_min: o.age_min,
          age_max: o.age_max,
          bookable: dates.some((d) => d.bookable),
          session_url: membersUrl(`/sessions/${o.slug}`),
          dates,
        };
      })
    );
    return NextResponse.json(
      { generated_at: new Date().toISOString(), timezone: TIMEZONE, offerings: live },
      { headers }
    );
  } catch (err) {
    console.error("[live-sessions]", err);
    return NextResponse.json({ error: "Live sessions are unavailable right now" }, { status: 503, headers });
  }
}
