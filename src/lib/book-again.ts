// "Book again" suggestions for the Bookings page: the sessions a member has
// booked before, each with its next date they are not already booked on.
//
// Built from the member's own bookings (already read on that page) plus the
// cached public catalogue, so it adds no per-member query. An offering that
// is no longer active drops out, because it is not in the active set.
import "server-only";
import { listOfferings, listUpcomingOccurrences } from "@/lib/catalogue";
import { formatOccurrence } from "@/lib/format";

export type PastBooking = {
  status: string;
  createdAtMs: number;
  offeringSlug: string;
  occurrenceId: string | null;
  participantName: string;
};

export type BookAgainItem = {
  slug: string;
  title: string;
  participantName: string;
  timesBooked: number;
  /** Formatted next date, or null for courses sold by run / no dates on sale. */
  nextDate: string | null;
};

// Bookings that show real intent. Holds that were never paid are not.
const COUNTED = new Set(["confirmed", "attended", "refunded", "cancelled"]);
const MAX_ITEMS = 4;

export async function bookAgainSuggestions(
  bookings: PastBooking[]
): Promise<BookAgainItem[]> {
  const groups = new Map<
    string,
    { slug: string; participantName: string; count: number; lastMs: number }
  >();
  for (const b of bookings) {
    if (!COUNTED.has(b.status)) continue;
    const key = `${b.offeringSlug}|${b.participantName}`;
    const g = groups.get(key) ?? {
      slug: b.offeringSlug,
      participantName: b.participantName,
      count: 0,
      lastMs: 0,
    };
    g.count += 1;
    g.lastMs = Math.max(g.lastMs, b.createdAtMs);
    groups.set(key, g);
  }
  if (groups.size === 0) return [];

  const active = new Map((await listOfferings({})).map((o) => [o.slug, o]));
  const alreadyBooked = new Set(
    bookings
      .filter((b) => b.status === "confirmed" && b.occurrenceId)
      .map((b) => `${b.occurrenceId}|${b.participantName}`)
  );

  const ranked = [...groups.values()]
    .filter((g) => active.has(g.slug))
    .sort((a, b) => b.count - a.count || b.lastMs - a.lastMs)
    .slice(0, MAX_ITEMS);

  return Promise.all(
    ranked.map(async (g) => {
      const offering = active.get(g.slug)!;
      let nextDate: string | null = null;
      if (offering.enrolment_scope === "per_occurrence") {
        const upcoming = await listUpcomingOccurrences(offering.id, 10);
        const next = upcoming.find(
          (o) => !alreadyBooked.has(`${o.id}|${g.participantName}`)
        );
        if (next) nextDate = formatOccurrence(next.starts_at, next.ends_at);
      }
      return {
        slug: g.slug,
        title: offering.title,
        participantName: g.participantName,
        timesBooked: g.count,
        nextDate,
      };
    })
  );
}
