// Business rules — provisional MVP defaults, ADR'd 2026-07-08.
// Source of truth for policy: Empowr KB entities/sessions.md.
// Each value is a named constant so a confirmed change from Jasmine/Shaun
// is a one-line swap. Do not inline any of these values in components
// or API routes.

/** Credits expire this many months after issue. Only issued via the
 *  Empowr-initiated occurrence-cancel flow (admin picks refund or
 *  credit) — members STILL have no self-serve path to a credit, even
 *  though self-serve cancellation returned with Programme Policies v1.2.
 *  Redemption is Phase 2 Step 5 and is unbuilt, so a member-chosen
 *  credit would be an unspendable balance. Revisit when Step 5 lands. */
export const CREDIT_EXPIRY_MONTHS = 12;

/** Self-serve cancellation cutoff — at or beyond this many hours before
 *  the session start, a member can cancel their own booking for a refund
 *  to the original card; inside it, cancellation is blocked and they must
 *  email. Published in Programme Policies v1.2 §5 and Terms &
 *  Conditions v1.2 §3, so a change here is a change to live legal text —
 *  it is also restated in PolicyNotice and the confirmation email. */
export const CANCELLATION_CUTOFF_HOURS = 48;

/** Walk-ins ARE system-captured as of 2026-08-28 — staff take them from a
 *  session's register and the member pays the door price by card, through
 *  the same Stripe Checkout and webhook as any online booking.
 *
 *  Capture is gated per offering, not by this flag: mem_hold_bookings()
 *  refuses a walk-in whose offering has no walk_in_price_pence rather than
 *  charging the online price. Today only Skate Jam and Roller Skate Events
 *  carry one. */
export const WALK_INS_CAPTURED = true;

/** Waiver linking mechanism: match mem_participants → people by
 *  normalised email + name at booking; unmatched → prompt to complete
 *  waiver; admin can link manually. */
export const WAIVER_LINK_STRATEGY = "email_name_match" as const;

/** pending_payment bookings hold capacity for this long before the
 *  pg_cron expiry job releases them (lands with the booking flow, Step 4). */
export const PENDING_BOOKING_EXPIRY_MINUTES = 30;

/** The booking statuses that occupy a place — THE definition of "taken".
 *
 *  It must stay a single definition. mem_hold_bookings() and the two
 *  mem_public_*_capacity() functions all count exactly these three in SQL, so
 *  any TypeScript tally that disagrees would contradict the thing that
 *  actually enforces capacity — and would do it silently, since a count that
 *  is merely wrong still renders.
 *
 *  This lived privately in lib/materialize-member-bookings.ts until the admin
 *  counters needed it too. Admin was NOT using it: listAdminOccurrences()
 *  counted mem_bookings with no status filter at all, so cancelled, credited
 *  and refunded bookings were reported to staff as booked. */
export const LIVE_BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "attended",
];

/** All occurrence times are wall-clock UK time. */
export const TIMEZONE = "Europe/London";
