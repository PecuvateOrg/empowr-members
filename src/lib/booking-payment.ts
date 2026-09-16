// THE ONE SWITCH for how a member pays.
//
// Until 2026-09-16 the booking form offered two routes side by side: "Add to
// basket", and "Book and pay now", which went straight to Stripe for that one
// session. The second ignored the basket entirely — deliberately, see the
// comment on rememberBasketCheckout() in booking-basket.ts — and that is the
// problem, not a detail of it:
//
//   * A member holding two sessions who opened a third and pressed "Book and
//     pay now" paid for the third alone, landed on a confirmation page
//     telling them they were booked, and left the other two sitting unpaid
//     in a basket they now had no reason to open again.
//   * Pressing BOTH buttons on the same page was worse. The session was paid
//     for directly and the identical card stayed in the basket, where it
//     failed at checkout as a duplicate — an item they could neither pay for
//     nor obviously account for.
//
// No money was ever at risk: the server refuses the second charge. What was
// wrong was the member's idea of what they had bought, and it was wrong in
// both directions. Owner's call (2026-09-16): every payment goes through the
// basket.
//
// FLIP THIS TO true TO PUT THE BUTTON BACK, exactly as it was. `submit()` in
// BookingForm and every error branch it owns are kept intact behind it, which
// is why this is a flag rather than a deletion — the payment path is the last
// place to find out a rollback needs a rewrite first.
//
// Typed `boolean` rather than left to infer `false`, so the guarded branch
// stays type-checked instead of narrowing to `never` and rotting unseen.
//
// A constant, NOT an env var: this decides what a member is shown at a
// checkout, and a value that can differ between two deploys of the same
// commit is not something anyone should have to debug through a hosting
// dashboard. Changing it is a commit, a review and a deploy, as it should be.
//
// NOTE: POST /api/bookings still accepts a single booking as well as
// { items: [...] }. That is not an oversight either — the shared service
// keeps every validation gate identical for both shapes, admin walk-ins rely
// on it, and verify-roller-equipment-booking.ts drives the single shape to
// pin equipment validation. Nothing in the member UI calls it while this is
// false.
export const BOOKING_FORM_SHOWS_PAY_NOW: boolean = false;
