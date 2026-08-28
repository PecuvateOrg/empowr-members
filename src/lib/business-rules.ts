// Business rules — provisional MVP defaults, ADR'd 2026-07-08.
// Source of truth for policy: Empowr KB entities/sessions.md.
// Each value is a named constant so a confirmed change from Jasmine/Shaun
// is a one-line swap. Do not inline any of these values in components
// or API routes.

/** Credits expire this many months after issue. Only issued via the
 *  Empowr-initiated occurrence-cancel flow (admin picks refund or
 *  credit) — members have no self-serve path to a credit. */
export const CREDIT_EXPIRY_MONTHS = 12;

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

/** All occurrence times are wall-clock UK time. */
export const TIMEZONE = "Europe/London";
