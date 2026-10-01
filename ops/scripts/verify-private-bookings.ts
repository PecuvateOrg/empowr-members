/**
 * verify-private-bookings.ts
 *
 * Run:  npm run verify:private-bookings      (from src/)
 *
 * Pins the TypeScript side of private bookings (src/lib/private-bookings.ts).
 *
 * The database is the authority on price and availability; it was verified
 * against the live schema in a rolled-back transaction (68 assertions, see
 * PR #81). What this suite pins is that the parts the app owns agree with it:
 *
 * - The display price uses the SAME worked examples the SQL suite used, so
 *   the form can never show a total the hold will not charge.
 * - Request validation refuses what the database would refuse, before a hold
 *   is attempted.
 * - A database refusal maps to the right words, and an unknown one maps to
 *   nothing (so no Postgres text reaches a customer).
 * - A staff-picked "Saturday at 3pm" lands on the right instant either side
 *   of the October clock change.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  londonSlotIso,
  formatPrivateSlot,
  privateBookingPrice,
  privateBookingRequestSchema,
  privateJoinSchema,
  MANUAL_PAYMENT_HANDLING,
  parsePrivateDraft,
  privateDraftPath,
  privateManualSchema,
  privateRpcRefusal,
  totalPlaces,
  type PrivateBookingType,
} from "@/lib/private-bookings";

// KB-confirmed rates, as seeded (entities/private-bookings, 2026-08-17).
const birthday: PrivateBookingType = {
  kind: "birthday", title: "", unit_price_pence: 2000, min_places: 10,
  max_places: null, hire_price_pence: null, active: true,
};
const one: PrivateBookingType = {
  kind: "coaching_one", title: "", unit_price_pence: 4000, min_places: 1,
  max_places: 1, hire_price_pence: 500, active: true,
};
const group: PrivateBookingType = {
  kind: "coaching_group", title: "", unit_price_pence: 2000, min_places: 3,
  max_places: null, hire_price_pence: 500, active: true,
};

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

test("price: the same worked examples the SQL suite asserts", () => {
  assert.equal(privateBookingPrice(one, 1, 1, 1)?.totalPence, 4500); // 1h 1:1 + hire
  assert.equal(privateBookingPrice(group, 1, 3, 1)?.totalPence, 6500); // 3 x 1h + 1 hire
  assert.equal(privateBookingPrice(group, 2, 3, 2)?.totalPence, 13000); // 3 x 2h + 2 hires
  assert.equal(privateBookingPrice(birthday, 2, 10, 0)?.totalPence, 20000); // 10 paid
});

test("price: hire is per skater per booking, never per hour", () => {
  const oneHour = privateBookingPrice(group, 1, 3, 2)!;
  const twoHours = privateBookingPrice(group, 2, 3, 2)!;
  assert.equal(oneHour.hirePence, 1000);
  assert.equal(twoHours.hirePence, 1000);
});

test("price: birthday hire is included, whatever is passed", () => {
  assert.equal(privateBookingPrice(birthday, 2, 10, 5)?.totalPence, 20000);
  assert.equal(privateBookingPrice(birthday, 2, 10, 5)?.hirePence, 0);
});

test("price: a quoted (custom) type has no computed price", () => {
  assert.equal(
    privateBookingPrice({ kind: "custom", unit_price_pence: null, hire_price_pence: null }, 2, 1, 0),
    null
  );
});

test("places: birthday adds the free place for the birthday person", () => {
  assert.equal(totalPlaces("birthday", 10), 11);
  assert.equal(totalPlaces("coaching_group", 3), 3);
});

test("request: a valid coaching booking parses", () => {
  const r = privateBookingRequestSchema.safeParse({
    kind: "coaching_group", starts_at: "2026-10-31T15:00:00.000Z", hours: 2, paid_places: 3,
    places: [
      { participant_id: P1, equipment: "hire", hire_size: "UK1-UK3" },
      { participant_id: P2, equipment: "own" },
      { participant_id: P3, equipment: "own" },
    ],
  });
  assert.equal(r.success, true);
});

test("request: refusals match what the database would refuse", () => {
  const base = { starts_at: "2026-10-31T15:00:00.000Z" };
  const cases: [string, unknown][] = [
    ["birthday for one hour", { ...base, kind: "birthday", hours: 1, paid_places: 10, places: [] }],
    ["birthday naming skaters up front", { ...base, kind: "birthday", hours: 2, paid_places: 10, places: [{ participant_id: P1, equipment: "own" }] }],
    ["1:1 for two skaters", { ...base, kind: "coaching_one", hours: 1, paid_places: 2, places: [{ participant_id: P1, equipment: "own" }, { participant_id: P2, equipment: "own" }] }],
    ["fewer skaters chosen than places", { ...base, kind: "coaching_group", hours: 1, paid_places: 3, places: [{ participant_id: P1, equipment: "own" }] }],
    ["the same skater twice", { ...base, kind: "coaching_group", hours: 1, paid_places: 3, places: [{ participant_id: P1, equipment: "own" }, { participant_id: P1, equipment: "own" }, { participant_id: P2, equipment: "own" }] }],
    ["hire with no size", { ...base, kind: "coaching_one", hours: 1, paid_places: 1, places: [{ participant_id: P1, equipment: "hire" }] }],
    ["custom online", { ...base, kind: "custom", hours: 2, paid_places: 1, places: [] }],
    ["three hours", { ...base, kind: "coaching_one", hours: 3, paid_places: 1, places: [{ participant_id: P1, equipment: "own" }] }],
    ["a time with no offset", { starts_at: "2026-10-31T15:00:00", kind: "birthday", hours: 2, paid_places: 10, places: [] }],
  ];
  for (const [label, body] of cases) {
    assert.equal(privateBookingRequestSchema.safeParse(body).success, false, label);
  }
});

test("join: token must be the 64-hex shape the database issues", () => {
  const ok = { token: "a".repeat(64), participant_id: P1, equipment: "own" };
  assert.equal(privateJoinSchema.safeParse(ok).success, true);
  assert.equal(privateJoinSchema.safeParse({ ...ok, token: "a".repeat(63) }).success, false);
  assert.equal(privateJoinSchema.safeParse({ ...ok, token: "Z".repeat(64) }).success, false);
  assert.equal(privateJoinSchema.safeParse({ ...ok, equipment: "hire" }).success, false);
});

test("manual: only the three online types, no payment choice or price", () => {
  const base = {
    kind: "birthday", host_account_id: P1, starts_at: "2026-10-31T15:00:00.000Z",
    hours: 2, paid_places: 10,
  };
  assert.equal(privateManualSchema.safeParse(base).success, true);
  // Custom events are no longer offered anywhere (owner decision 2026-09-29).
  assert.equal(privateManualSchema.safeParse({ ...base, kind: "custom" }).success, false);
  // The payment value is fixed server-side; a client cannot choose one.
  const parsed = privateManualSchema.parse({ ...base, payment_handling: "comp", price_pence: 1 });
  assert.equal("payment_handling" in parsed, false);
  assert.equal("price_pence" in parsed, false);
  assert.equal(MANUAL_PAYMENT_HANDLING, "paid_before_launch");
});

test("draft: choices survive the sign-in round trip; junk is dropped", () => {
  const draft = {
    kind: "coaching_group" as const, hours: 2 as const, paidPlaces: 4,
    startsAt: "2026-10-31T15:00:00.000Z",
    equipment: [
      { equipment: "own" as const, hire_size: "" as const },
      { equipment: "hire" as const, hire_size: "UK1-UK3" as const },
    ],
  };
  const path = privateDraftPath(draft);
  assert.match(path, /^\/private-bookings\?/);
  const back = parsePrivateDraft(Object.fromEntries(new URL(path, "https://x").searchParams));
  assert.deepEqual(back, draft);

  // EELA's date picker sends a date and length with no count.
  const fromEela = parsePrivateDraft({ type: "party", at: "2026-10-31T14:00:00.000Z", h: "2" })!;
  assert.equal(fromEela.startsAt, "2026-10-31T14:00:00.000Z");
  assert.equal(fromEela.paidPlaces, 1);
  assert.equal(parsePrivateDraft({ type: "nope", n: "3" }), null);
  assert.equal(parsePrivateDraft({ type: "group", n: "-1" }), null);
  const party = parsePrivateDraft({ type: "party", n: "12", h: "1", at: "not a date" })!;
  assert.equal(party.hours, 2); // a party is always the full two hours
  assert.equal(party.startsAt, null);
  const junkSize = parsePrivateDraft({ type: "one", n: "1", eq: "hire:XXL" })!;
  assert.deepEqual(junkSize.equipment, [{ equipment: "own", hire_size: "" }]);
});

test("refusals: each database code maps to its own message", () => {
  const raise = (code: string) => `ERROR:  P0001: ${code}`;
  assert.match(privateRpcRefusal(raise("mem_private_too_soon"))!.message, /two weeks/);
  assert.match(privateRpcRefusal(raise("mem_private_second_hour_locked"))!.message, /3–4pm/);
  assert.match(privateRpcRefusal(raise("mem_private_session_clash"))!.message, /session/);
  assert.equal(privateRpcRefusal(raise("mem_private_full"))!.status, 409);
  assert.equal(privateRpcRefusal(raise("mem_private_bad_places"))!.status, 400);
});

test("refusals: an unknown or raw Postgres error maps to nothing", () => {
  assert.equal(privateRpcRefusal('duplicate key value violates unique constraint "x"'), null);
  assert.equal(privateRpcRefusal(undefined), null);
  assert.equal(privateRpcRefusal("mem_private_something_new"), null);
});

test("time: 3pm London is 14:00Z in BST and 15:00Z in GMT", () => {
  // Clocks go back on Sunday 25 October 2026.
  assert.equal(londonSlotIso("2026-10-24", 15), "2026-10-24T14:00:00.000Z");
  assert.equal(londonSlotIso("2026-10-31", 15), "2026-10-31T15:00:00.000Z");
  assert.equal(londonSlotIso("2026-10-31", 16), "2026-10-31T16:00:00.000Z");
});

test("time: slots display in London time on both sides of the change", () => {
  assert.equal(
    formatPrivateSlot("2026-10-24T14:00:00.000Z", "2026-10-24T16:00:00.000Z"),
    "Sat 24 Oct 2026, 3–5pm"
  );
  assert.equal(
    formatPrivateSlot("2026-10-31T16:00:00.000Z", "2026-10-31T17:00:00.000Z"),
    "Sat 31 Oct 2026, 4–5pm"
  );
});
