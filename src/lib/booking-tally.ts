// How the places on an occurrence or course run are taken up.
//
// Deliberately its own module rather than part of lib/admin-data.ts, which
// carries `import "server-only"`: the admin managers are "use client"
// components and need these helpers as VALUES, not just types. Importing them
// from admin-data would pull the server-only guard into the client bundle and
// break the build. Nothing here touches the database, so nothing here needs
// to be server-only — the queries stay in admin-data and hand these shapes out.

/** The booking statuses that occupy a place. Re-exported from business-rules
 *  so this module owns no second definition of "taken" — mem_hold_bookings()
 *  and the public capacity RPCs count exactly the same three in SQL. */
import { LIVE_BOOKING_STATUSES } from "@/lib/business-rules";

/**
 * `paid` and `subscribed` are split because they are not the same fact to
 * staff: `paid` is someone who handed over money for this date, `subscribed`
 * is a place a Subscription reserved at £0. Both hold a real mem_bookings row
 * since Phase 2 Step 4, so a single merged total — which is what the admin
 * screens showed until 2026-09-02 — makes them indistinguishable, and the
 * takings the number implies are wrong.
 *
 * `inactive` counts cancelled/credited/refunded/no_show. Those occupy no place
 * and must never reach a head-count, but they still FK-reference the row, so
 * they decide whether it can be hard-deleted. Carrying them here is what lets
 * a single query answer both questions.
 */
export type BookingTally = {
  paid: number;
  subscribed: number;
  inactive: number;
};

export const EMPTY_TALLY: BookingTally = {
  paid: 0,
  subscribed: 0,
  inactive: 0,
};

/** Places actually taken — what a head-count shows. */
export function occupied(tally: BookingTally): number {
  return tally.paid + tally.subscribed;
}

/**
 * Whether ANY booking row references this occurrence/run, live or not.
 *
 * The delete gate, and deliberately not `occupied() === 0`. mem_bookings' FKs
 * to mem_occurrences and mem_course_runs carry no ON DELETE clause, so
 * Postgres defaults to NO ACTION and refuses the delete while any row points
 * at it — cancelled rows very much included. Gating on the live count alone
 * would offer staff a Remove button that always fails with a foreign-key error
 * the moment a booking had ever been cancelled.
 */
export function hasHistory(tally: BookingTally): boolean {
  return occupied(tally) > 0 || tally.inactive > 0;
}

/** Bucket one booking row into the tally it belongs in. */
export function addToTally(
  tally: BookingTally,
  status: string,
  source: string
): void {
  if (!LIVE_BOOKING_STATUSES.includes(status)) {
    tally.inactive += 1;
  } else if (source === "member") {
    // A place materialised from a Subscription, at £0.
    tally.subscribed += 1;
  } else {
    // 'online' and 'walk_in' both paid. A new mem_booking_source value lands
    // here by default — deliberate, since undercounting subscribers is a far
    // safer way to be wrong at a door than undercounting people who paid.
    tally.paid += 1;
  }
}
