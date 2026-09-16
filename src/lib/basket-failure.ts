// What went wrong at basket checkout, and what the member can DO about it.
//
// WHY THIS IS A MODULE AND NOT A MAP OF STRINGS. Until 2026-09-16 the booking
// form carried its own "Book and pay now" button, and it handled these same
// errors far better than the basket did: an unsigned waiver named the person
// and linked them straight to /waiver, and a sold-out early bird dropped the
// form back to the standard price on the spot. The basket said "a participant
// needs a signed waiver" — no name, no link — which was survivable only
// because a blocked member could fall back on that button.
//
// That button is gone (BOOKING_FORM_SHOWS_PAY_NOW in booking-payment.ts) and
// the basket is the only checkout there is. A message a member cannot act on
// is now a dead end at the one place money changes hands, so every branch
// below carries the names the API already sends and, where one exists, the
// link that fixes it. None of this data is new: the API has always returned
// `unsigned`, `covered` and `ineligible`, and the basket was discarding them.
//
// Pure and free of React on purpose — verify-basket-failure.ts drives it with
// the API's real payload shapes.

import { targetKey, type BookingBasketItem } from "@/lib/booking-basket";

export type BasketFailure = {
  /** A whole sentence, names already folded in. */
  message: string;
  /** The one thing to press. Null where nothing the member can press fixes
   *  it — an offer to act that does not act is worse than no offer. */
  fix: { href: string; label: string } | null;
  /** The basket card at fault, when the server could attribute it. The card
   *  is outlined so that "that booking" means something in a basket of ten. */
  bookingKey: string | null;
};

export const GENERIC_BASKET_FAILURE =
  "We couldn't start payment. Your basket is still here — please try again.";

function rowsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> => !!row && typeof row === "object"
      )
    : [];
}

function namesFrom(value: unknown): string[] {
  return rowsOf(value)
    .map((row) => row.name)
    .filter((name): name is string => typeof name === "string" && name.trim() !== "");
}

function planFrom(value: unknown): string | null {
  for (const row of rowsOf(value)) {
    if (typeof row.plan === "string" && row.plan.trim() !== "") return row.plan;
  }
  return null;
}

/** "Amara", "Amara and Joe", "Amara, Joe and Sam" — not a bare comma join.
 *  These names are read by a parent under time pressure at a checkout that
 *  has just refused them. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function describeBasketFailure(
  body: unknown,
  items: BookingBasketItem[]
): BasketFailure {
  const payload = (body ?? {}) as Record<string, unknown>;
  const code = typeof payload.error === "string" ? payload.error : "";

  // Attribution is ADVISORY and is matched against what is on screen before
  // anything is outlined. A basket edited in another tab, or a stale page,
  // can name a booking this view no longer holds — and outlining nothing is
  // a great deal better than outlining the wrong card at a checkout.
  const attributed =
    payload.booking && typeof payload.booking === "object"
      ? targetKey(payload.booking as { occurrence_id?: string; course_run_id?: string })
      : null;
  const at = items.find((item) => item.key === attributed) ?? null;
  const bookingKey = at?.key ?? null;
  // Only offered when we know WHICH booking. "Edit that booking" with no
  // outlined card and no destination is the dead end this file exists to
  // remove, not a softer version of it.
  const editThat = at
    ? { href: at.bookingPath, label: "Edit that booking" }
    : null;

  switch (code) {
    case "waiver_required": {
      const who = namesFrom(payload.unsigned);
      return {
        message: who.length
          ? `${joinNames(who)} ${who.length === 1 ? "needs" : "need"} a signed waiver before you can book. Nothing has been charged and your basket is still here.`
          : "Someone in your basket needs a signed waiver before you can book. Nothing has been charged and your basket is still here.",
        // The waiver covers the PERSON, not the booking, so this is the fix
        // whichever card they are on — which is also why the server checks
        // it once across the whole basket rather than per item.
        fix: { href: "/waiver", label: "Complete the waiver" },
        bookingKey: null,
      };
    }

    case "already_covered": {
      const who = namesFrom(payload.covered);
      const plan = planFrom(payload.covered) ?? "a membership";
      const subject = who.length ? joinNames(who) : "Someone in your basket";
      const verb = who.length === 1 ? "is" : "are";
      return {
        message: `${subject} ${verb} already covered by ${plan} for one of these sessions, so we won't charge you twice. Take them off that booking, or remove it from your basket.`,
        fix: editThat,
        bookingKey,
      };
    }

    case "age_ineligible": {
      const who = namesFrom(payload.ineligible);
      const subject = who.length ? joinNames(who) : "Someone in your basket";
      const verb = who.length === 1 ? "is" : "are";
      return {
        message: `${subject} ${verb} outside the age range for one of these sessions. Nothing has been charged.`,
        fix: editThat,
        bookingKey,
      };
    }

    // The four below come from the database hold, which fails as one
    // statement over the whole basket and cannot say which item was at
    // fault. `editThat` is still read: the day the server can attribute one
    // of these, it starts working with no change here.
    case "capacity":
      return {
        message:
          "One of these sessions no longer has enough spaces. Nothing has been charged or reserved — edit that booking or remove it, then try again.",
        fix: editThat,
        bookingKey,
      };

    case "duplicate":
      return {
        message:
          "Someone in your basket is already booked on one of these sessions. Check what you have booked already, then remove the repeat from your basket.",
        fix: { href: "/bookings", label: "View your bookings" },
        bookingKey,
      };

    case "early_bird_gone":
      return {
        message:
          typeof payload.message === "string" && payload.message
            ? `${payload.message} Open that booking and choose the standard ticket.`
            : "An early bird ticket in your basket has just sold out. Open that booking and choose the standard ticket.",
        fix: editThat,
        bookingKey,
      };

    case "basket_changed":
      return {
        message:
          "Your basket changed since this page loaded — check it in another tab or window, then try again.",
        fix: null,
        bookingKey: null,
      };

    default:
      // Some failures arrive as a finished sentence in `error` rather than a
      // code (the 500s, and the "can no longer be booked" 404). Those are
      // shown as written; anything else falls back to the generic line.
      return {
        message: code || GENERIC_BASKET_FAILURE,
        fix: null,
        bookingKey: null,
      };
  }
}
