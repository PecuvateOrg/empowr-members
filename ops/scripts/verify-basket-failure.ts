/**
 * verify-basket-failure.ts
 *
 * Run:
 *   npm run verify:basket-failure
 *
 * THE BUG THIS EXISTS FOR. On 2026-09-16 the booking form's "Book and pay
 * now" button was switched off and the basket became the only way a member
 * can pay. Until then the basket's error handling was a map of seven flat
 * strings: an unsigned waiver produced "A participant needs a signed waiver
 * before this basket can be booked" — no name, no link — and that was
 * survivable only because a blocked member could drop back to the form's own
 * button, which named the person and linked them to /waiver.
 *
 * With that button gone, a message a member cannot act on is a dead end at
 * the one place money changes hands. The API had been sending the names all
 * along (`unsigned`, `covered`, `ineligible`); the basket was discarding
 * them.
 *
 * So these are not tests of wording. They pin the property that replaced the
 * button: every failure a member can actually fix names who is blocking it
 * and offers something to press. The payloads below are copied from the
 * responses in lib/booking-checkout.ts, so a change to the wire format
 * breaks this rather than silently reverting the basket to "a participant".
 *
 * The alias loader is what makes this runnable: node strips the TS types
 * itself, but not the "@/*" path alias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  describeBasketFailure,
  GENERIC_BASKET_FAILURE,
} from "@/lib/basket-failure";
import { BOOKING_FORM_SHOWS_PAY_NOW } from "@/lib/booking-payment";
import type { BookingBasketItem } from "@/lib/booking-basket";

const OCCURRENCE = "11111111-1111-4111-8111-111111111111";
const OTHER_OCCURRENCE = "22222222-2222-4222-8222-222222222222";

function card(occurrenceId: string, title: string): BookingBasketItem {
  return {
    occurrence_id: occurrenceId,
    participant_ids: ["p1"],
    departure_consents: [],
    roller_equipment: [],
    early_bird: false,
    key: `occurrence:${occurrenceId}`,
    offeringTitle: title,
    when: "Saturday 4 October, 10:00",
    venue: "The Hangar",
    participantNames: ["Amara"],
    unitPricePence: 800,
    bookingPath: `/book/${occurrenceId}`,
  };
}

const BASKET = [card(OCCURRENCE, "Roller Disco"), card(OTHER_OCCURRENCE, "Skate School")];

// --- The property the pay-now button used to provide ------------------------

test('every fixable refusal names the person and offers something to press', () => {
  // The three the member can act on themselves. Each carries names from the
  // API, and each must end up with a fix — a waiver to sign, or the specific
  // booking to edit. This is the assertion that fails if anyone reverts the
  // basket to flat strings.
  const cases = [
    {
      body: {
        error: "waiver_required",
        unsigned: [{ id: "p1", name: "Amara" }],
      },
      name: "Amara",
    },
    {
      body: {
        error: "already_covered",
        booking: { occurrence_id: OCCURRENCE },
        covered: [{ id: "p1", name: "Joe", plan: "Skate Club" }],
      },
      name: "Joe",
    },
    {
      body: {
        error: "age_ineligible",
        booking: { occurrence_id: OCCURRENCE },
        ineligible: [{ id: "p1", name: "Sam" }],
      },
      name: "Sam",
    },
  ];

  for (const { body, name } of cases) {
    const failure = describeBasketFailure(body, BASKET);
    assert.ok(
      failure.message.includes(name),
      `${body.error} must name the person — got: ${failure.message}`
    );
    assert.ok(
      failure.fix,
      `${body.error} must offer a fix to press, or the only checkout dead-ends`
    );
    assert.ok(
      failure.fix!.href.length > 0 && failure.fix!.label.length > 0,
      `${body.error} fix needs both a destination and a label`
    );
  }
});

test('an unsigned waiver links to the waiver, not to the booking', () => {
  // The waiver covers the PERSON, so it is the fix whichever card they are
  // on — and it is why the server checks it once for the whole basket rather
  // than per item. Pointing this at "edit that booking" would send someone to
  // a page that cannot resolve it.
  const failure = describeBasketFailure(
    { error: "waiver_required", unsigned: [{ id: "p1", name: "Amara" }] },
    BASKET
  );
  assert.equal(failure.fix?.href, "/waiver");
  assert.equal(
    failure.bookingKey,
    null,
    "a waiver block belongs to no single card and must outline none"
  );
});

test('several names read as a list, not a comma dump', () => {
  const failure = describeBasketFailure(
    {
      error: "waiver_required",
      unsigned: [
        { id: "p1", name: "Amara" },
        { id: "p2", name: "Joe" },
        { id: "p3", name: "Sam" },
      ],
    },
    BASKET
  );
  assert.ok(
    failure.message.includes("Amara, Joe and Sam"),
    `expected a readable list — got: ${failure.message}`
  );
  assert.ok(
    failure.message.includes("need a signed waiver"),
    'three people "need" a waiver, they do not "needs" one'
  );
});

// --- Attribution ------------------------------------------------------------

test('a per-item failure outlines the card the server blamed', () => {
  const failure = describeBasketFailure(
    {
      error: "age_ineligible",
      booking: { occurrence_id: OTHER_OCCURRENCE },
      ineligible: [{ id: "p1", name: "Sam" }],
    },
    BASKET
  );
  assert.equal(failure.bookingKey, `occurrence:${OTHER_OCCURRENCE}`);
  assert.equal(
    failure.fix?.href,
    `/book/${OTHER_OCCURRENCE}`,
    "the fix must point at the blamed booking, not the first one in the basket"
  );
});

test('an attribution the basket no longer holds outlines NOTHING', () => {
  // A basket edited in another tab, or a stale page. Outlining the wrong card
  // at a checkout is worse than outlining none, so the server's attribution
  // is matched against what is actually on screen before it is used.
  const failure = describeBasketFailure(
    {
      error: "age_ineligible",
      booking: { occurrence_id: "33333333-3333-4333-8333-333333333333" },
      ineligible: [{ id: "p1", name: "Sam" }],
    },
    BASKET
  );
  assert.equal(failure.bookingKey, null);
  assert.equal(
    failure.fix,
    null,
    'an unattributable failure must not offer "Edit that booking" with nowhere to go'
  );
  assert.ok(
    failure.message.includes("Sam"),
    "losing the attribution must not lose the name as well"
  );
});

// --- The ones the server genuinely cannot attribute --------------------------

test('a hold failure still says what to do, without inventing a culprit', () => {
  // capacity / duplicate / early_bird_gone / basket_changed come from the
  // database hold, which fails as one statement over the whole basket. They
  // must stay actionable prose and must NOT outline an arbitrary card.
  for (const code of ["capacity", "duplicate", "early_bird_gone", "basket_changed"]) {
    const failure = describeBasketFailure({ error: code }, BASKET);
    assert.ok(failure.message.length > 20, `${code} needs a real sentence`);
    assert.equal(
      failure.bookingKey,
      null,
      `${code} cannot be attributed to one card and must outline none`
    );
  }
});

test('nothing is charged is said where nothing is charged', () => {
  // The single most reassuring fact at a refused checkout, and the one a
  // member will not assume. Pinned for the branches where it is true.
  for (const body of [
    { error: "waiver_required", unsigned: [{ id: "p1", name: "Amara" }] },
    { error: "age_ineligible", ineligible: [{ id: "p1", name: "Sam" }] },
    { error: "capacity" },
  ]) {
    const failure = describeBasketFailure(body, BASKET);
    assert.match(
      failure.message,
      /nothing has been charged/i,
      `${body.error} should say nothing has been charged — got: ${failure.message}`
    );
  }
});

// --- Malformed input --------------------------------------------------------

test('a body with no usable error falls back rather than rendering blank', () => {
  // An empty object is what `response.json().catch(() => ({}))` produces on a
  // non-JSON response — a proxy error page, say. A blank red box tells a
  // member nothing at the moment they most need telling.
  for (const body of [{}, null, undefined, { error: 42 }, { error: "" }]) {
    const failure = describeBasketFailure(body, BASKET);
    assert.equal(failure.message, GENERIC_BASKET_FAILURE);
  }
});

test('a server sentence in `error` is shown as written', () => {
  // The 500s and the "can no longer be booked" 404 send prose, not a code.
  const failure = describeBasketFailure(
    { error: "One of these sessions can no longer be booked." },
    BASKET
  );
  assert.equal(failure.message, "One of these sessions can no longer be booked.");
});

test('rows missing a name degrade to a subject rather than an empty gap', () => {
  // participantById.get(...)?.name ?? "" in booking-checkout.ts means the API
  // can genuinely send a nameless row. " is outside the age range" reads as a
  // rendering bug; "Someone in your basket" reads as English.
  const failure = describeBasketFailure(
    { error: "age_ineligible", ineligible: [{ id: "p1", name: "" }] },
    BASKET
  );
  assert.ok(
    failure.message.startsWith("Someone in your basket"),
    `expected a fallback subject — got: ${failure.message}`
  );
});

// --- The button stays off ---------------------------------------------------
//
// The tests above pin the RECOVERY. Nothing in them notices if the thing the
// recovery replaced comes back: flip the constant, or drop the guard and
// render `submit` inline again, and every assertion above still passes while
// a member is once more one press away from paying for one session and
// walking off leaving the rest of their basket behind.

const bookingForm = fs.readFileSync(
  path.join(import.meta.dirname, "..", "..", "src", "components", "booking", "BookingForm.tsx"),
  "utf8"
);

test('every payment goes through the basket', () => {
  assert.equal(
    BOOKING_FORM_SHOWS_PAY_NOW,
    false,
    "BOOKING_FORM_SHOWS_PAY_NOW is true. That restores a second payment route " +
      "that ignores the basket entirely — read booking-payment.ts before " +
      "changing this test, because the reasoning is not about tidiness."
  );
});

test('the form has exactly one submit path, and it is behind the flag', () => {
  // Structural, on source text, because no type or build catches this. The
  // old button is kept whole on purpose so the rollback is one constant —
  // which is precisely why its guard has to be pinned.
  const calls = [...bookingForm.matchAll(/onClick=\{submit\}/g)];
  assert.equal(
    calls.length,
    1,
    `expected one onClick={submit} in BookingForm, found ${calls.length}`
  );

  const guard = bookingForm.indexOf("{BOOKING_FORM_SHOWS_PAY_NOW && (");
  assert.notEqual(
    guard,
    -1,
    "BookingForm must render the pay-now button behind BOOKING_FORM_SHOWS_PAY_NOW"
  );
  assert.ok(
    guard < calls[0].index!,
    "onClick={submit} appears OUTSIDE the BOOKING_FORM_SHOWS_PAY_NOW guard — " +
      "the pay-now button is live again"
  );
});

test('the basket hand-off reads the basket live rather than freezing a count', () => {
  // The first version took `bookings` and `places` as props, computed once on
  // the press. Remove a card in a second tab and it kept claiming the old
  // number while the nav badge beside it showed the new one — two numbers for
  // one basket, on one screen, at a checkout.
  const handoff = fs.readFileSync(
    path.join(import.meta.dirname, "..", "..", "src", "components", "booking", "BasketHandoff.tsx"),
    "utf8"
  );
  assert.match(
    handoff,
    /BOOKING_BASKET_EVENT/,
    "BasketHandoff must subscribe to BOOKING_BASKET_EVENT, as useBasketCount does"
  );
  assert.match(
    handoff,
    /addEventListener\("storage", sync\)/,
    "the CustomEvent does not fire in OTHER tabs — `storage` is what covers them"
  );
  assert.doesNotMatch(
    bookingForm,
    /<BasketHandoff[^>]*bookings=/,
    "BookingForm is passing a frozen count into BasketHandoff again"
  );
});
