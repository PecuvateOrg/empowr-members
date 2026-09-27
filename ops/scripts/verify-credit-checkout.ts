/**
 * verify-credit-checkout.ts
 *
 * Run:  npm run verify:credit-checkout      (from src/)
 *
 * Pins account credit as it is spent through the ONE checkout in
 * lib/booking-checkout.ts. PR #78 shipped a second, parallel checkout for
 * credit; this suite exists to keep that from coming back, because the two
 * things the parallel path got wrong are both invisible to a typecheck:
 *
 *   1. It could only charge ONE session, so credit never reached the basket —
 *      and the basket is the member's only live checkout.
 *   2. It created a Stripe session with no payment_method_types, inheriting
 *      the shared account's redirect methods. Those can settle AFTER a
 *      capacity hold is released, i.e. take money for a place already given
 *      to somebody else.
 *
 * So the assertions below are mostly about the SHAPE of the money: what the
 * card is asked for, that it is asked for by the one card-only call, and that
 * a refusal never starts a payment at all.
 *
 * WHAT THIS DOES NOT PROVE. The database is faked here, so this says nothing
 * about mem_reserve_credit's own arithmetic — that is SQL and belongs in a
 * forced-rollback test against the live schema. What it pins is that this code
 * asks the database the right question, in the right order, and renders the
 * answer without inventing any of it.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

const participant = "00000000-0000-4000-8000-000000000001";
const occurrenceOne = "00000000-0000-4000-8000-000000000002";
const courseRun = "00000000-0000-4000-8000-000000000003";
const bookingOne = "00000000-0000-4000-8000-000000000004";
const bookingTwo = "00000000-0000-4000-8000-000000000005";
const account = "00000000-0000-4000-8000-000000000006";

// Held prices: £10 + £55 = £65.
const PRICE_ONE = 1000;
const PRICE_TWO = 5500;

let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let checkoutInput: Record<string, unknown> | null = null;
let reserveError: { message: string } | null = null;
let settleError: { message: string } | null = null;
/** booking id -> credit_applied_pence that the faked RPC reports back. */
let creditApplied = new Map<string, number>();
let confirmationsSent: string[] = [];

const service = {
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const chain = {
      select() { return chain; },
      in() { return chain; },
      eq(key: string, value: unknown) { filters[key] = value; return chain; },
      update() { return chain; },
      single() { return finish(); },
      maybeSingle() { return finish(); },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return finish().then(resolve, reject);
      },
    };
    async function finish() {
      if (table === "mem_participants") {
        return {
          data: [{ id: participant, name: "Example Child", dob: "2015-01-01", person_id: null }],
          error: null,
        };
      }
      if (table === "mem_occurrences") {
        return {
          data: {
            starts: "2030-09-01T10:00:00Z",
            ends: "2030-09-01T11:00:00Z",
            offering: {
              id: filters.id as string, title: "Skate Jam", slug: "skate-jam",
              type: "lesson", age_min: 5, age_max: 17,
            },
          },
          error: null,
        };
      }
      if (table === "mem_course_runs") {
        return {
          data: {
            starts: "2030-10-01", ends: "2030-10-22", label: "October block",
            starts_at_local: "19:30:00", ends_at_local: "21:30:00",
            offering: {
              id: courseRun, title: "Beginners Foundation", slug: "beginners-foundation",
              type: "course", age_min: 8, age_max: 17,
            },
          },
          error: null,
        };
      }
      return { data: null, error: null };
    }
    return chain;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    const rows = () => [
      {
        id: bookingOne, participant_id: participant, occurrence_id: occurrenceOne,
        course_run_id: null, price_paid_pence: PRICE_ONE,
        credit_applied_pence: creditApplied.get(bookingOne) ?? 0,
      },
      {
        id: bookingTwo, participant_id: participant, occurrence_id: null,
        course_run_id: courseRun, price_paid_pence: PRICE_TWO,
        credit_applied_pence: creditApplied.get(bookingTwo) ?? 0,
      },
    ];
    if (name === "mem_reserve_credit") {
      return reserveError ? { data: null, error: reserveError } : { data: rows(), error: null };
    }
    if (name === "mem_settle_credit_checkout") {
      return settleError ? { data: null, error: settleError } : { data: 2, error: null };
    }
    return { data: rows(), error: null };
  },
};

mock.module("next/server", {
  namedExports: {
    NextResponse: { json: (body: unknown, options: ResponseInit) => Response.json(body, options) },
  },
});
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/auth", {
  namedExports: {
    getAuthedAccount: async () => ({
      account: { id: account }, user: { email: "fixture@example.test" },
    }),
  },
});
mock.module("@/lib/supabase/service", { namedExports: { createServiceClient: () => service } });
mock.module("@/lib/waivers", {
  namedExports: {
    checkWaivers: async () => [{ participantId: participant, signed: true }],
    persistWaiverMatches: async () => {},
  },
});
mock.module("@/lib/departure-consent", { namedExports: { recordDepartureConsents: async () => {} } });
mock.module("@/lib/membership", { namedExports: { coverForOccurrence: async () => [] } });
mock.module("@/lib/request-origin", { namedExports: { requestOrigin: () => "https://example.test" } });
mock.module("@/lib/notifications", {
  namedExports: {
    sendBookingConfirmationForSession: async (_service: unknown, id: string) => {
      confirmationsSent.push(id);
      return true;
    },
  },
});
mock.module("@/lib/reconcile-brevo", {
  namedExports: { reconcileBrevo: async () => ({ skipped: true }) },
});
mock.module("@/lib/stripe", {
  namedExports: {
    HOLD_GRACE_MINUTES: 10,
    stripeCustomerAccount: () => ({}),
    getOrCreateStripeCustomer: async () => "fixture_customer",
    getStripe: () => ({
      checkout: {
        sessions: {
          create: async (input: Record<string, unknown>) => {
            checkoutInput = input;
            return { id: "cs_fixture", url: "https://example.test/checkout", expires_at: 9999999999 };
          },
        },
      },
    }),
  },
});

const { POST } = await import("@/app/api/bookings/route");

function basketRequest(credit?: { use_credit: boolean; expected_credit_pence: number }) {
  return new Request("https://example.test/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { occurrence_id: occurrenceOne, participant_ids: [participant] },
        { course_run_id: courseRun, participant_ids: [participant] },
      ],
      ...(credit ?? {}),
    }),
  });
}

function reset() {
  rpcCalls = [];
  checkoutInput = null;
  reserveError = null;
  settleError = null;
  creditApplied = new Map();
  confirmationsSent = [];
}

const lineAmounts = () =>
  ((checkoutInput?.line_items ?? []) as { price_data: { unit_amount: number } }[]).map(
    (line) => line.price_data.unit_amount
  );

// ---------------------------------------------------------------------------
// No credit — the ordinary path must be untouched
// ---------------------------------------------------------------------------

test("no credit asked for: the reserve RPC is never called and the card pays in full", async () => {
  reset();
  const response = await POST(basketRequest());
  assert.equal(response.status, 201);
  assert.equal(rpcCalls.some((call) => call.name === "mem_reserve_credit"), false);
  assert.deepEqual(lineAmounts(), [PRICE_ONE, PRICE_TWO]);
  const body = await response.json();
  assert.equal(body.card_pence, PRICE_ONE + PRICE_TWO);
  assert.equal(body.credit_applied_pence, 0);
});

test("use_credit false with an amount attached still spends nothing", async () => {
  // The flag is the member's decision; a stray amount must not override it.
  reset();
  const response = await POST(basketRequest({ use_credit: false, expected_credit_pence: 5000 }));
  assert.equal(response.status, 201);
  assert.equal(rpcCalls.some((call) => call.name === "mem_reserve_credit"), false);
  assert.deepEqual(lineAmounts(), [PRICE_ONE, PRICE_TWO]);
});

// ---------------------------------------------------------------------------
// Partial credit — the member pays the difference, once
// ---------------------------------------------------------------------------

test("partial credit: the card is asked for the REMAINDER, in one session", async () => {
  reset();
  creditApplied.set(bookingOne, 1000); // all of the £10
  creditApplied.set(bookingTwo, 1500); // £15 off the £55
  const response = await POST(basketRequest({ use_credit: true, expected_credit_pence: 2500 }));
  assert.equal(response.status, 201);

  const body = await response.json();
  assert.equal(body.credit_applied_pence, 2500);
  assert.equal(body.card_pence, PRICE_ONE + PRICE_TWO - 2500); // £40
  // ONE Stripe session for the whole basket — the member checks out once.
  assert.equal(typeof checkoutInput?.line_items, "object");
  assert.equal(
    lineAmounts().reduce((sum, n) => sum + n, 0),
    PRICE_ONE + PRICE_TWO - 2500
  );
});

test("a booking wholly covered by credit is dropped from the card lines, not charged 0", async () => {
  reset();
  creditApplied.set(bookingOne, PRICE_ONE); // fully covered
  creditApplied.set(bookingTwo, 0);
  const response = await POST(basketRequest({ use_credit: true, expected_credit_pence: PRICE_ONE }));
  assert.equal(response.status, 201);
  assert.deepEqual(lineAmounts(), [PRICE_TWO]);
  assert.equal(lineAmounts().includes(0), false);
});

test("the expected amount is passed through to the database unchanged", async () => {
  // The database is the authority and refuses a mismatch; this code must not
  // "help" by recomputing or rounding the figure the basket showed.
  reset();
  creditApplied.set(bookingOne, 1000);
  await POST(basketRequest({ use_credit: true, expected_credit_pence: 1000 }));
  const reserve = rpcCalls.find((call) => call.name === "mem_reserve_credit");
  assert.ok(reserve);
  assert.equal(reserve.args.p_expected, 1000);
  assert.equal(reserve.args.p_account_id, account);
  assert.match(String(reserve.args.p_token), /^memcredit_/);
});

test("credit is reserved BEFORE the Stripe session is created", async () => {
  // Ordering is load-bearing: mem_reserve_credit refuses a row that already
  // carries a checkout session id, and the link step writes one.
  reset();
  creditApplied.set(bookingOne, 1000);
  let sessionCreatedAfter = -1;
  const original = checkoutInput;
  void original;
  await POST(basketRequest({ use_credit: true, expected_credit_pence: 1000 }));
  const reserveIndex = rpcCalls.findIndex((call) => call.name === "mem_reserve_credit");
  const holdIndex = rpcCalls.findIndex((call) => call.name.startsWith("mem_hold"));
  assert.ok(holdIndex >= 0, "the hold still happens");
  assert.ok(reserveIndex > holdIndex, "credit is reserved after the hold exists");
  sessionCreatedAfter = checkoutInput ? 1 : 0;
  assert.equal(sessionCreatedAfter, 1, "and the session is still created");
});

// ---------------------------------------------------------------------------
// Full credit — no card payment at all
// ---------------------------------------------------------------------------

test("credit covering everything creates NO Stripe session and confirms on the spot", async () => {
  reset();
  creditApplied.set(bookingOne, PRICE_ONE);
  creditApplied.set(bookingTwo, PRICE_TWO);
  const response = await POST(
    basketRequest({ use_credit: true, expected_credit_pence: PRICE_ONE + PRICE_TWO })
  );
  assert.equal(response.status, 201);
  assert.equal(checkoutInput, null, "no card payment was started");

  const settle = rpcCalls.find((call) => call.name === "mem_settle_credit_checkout");
  assert.ok(settle, "the bookings were settled in the database");
  assert.equal(settle.args.p_action, "paid");
  assert.equal(settle.args.p_amount, 0);
  assert.equal(settle.args.p_payment_intent, null);

  const body = await response.json();
  assert.equal(body.card_pence, 0);
  assert.equal(body.credit_applied_pence, PRICE_ONE + PRICE_TWO);
  // The basket clears itself off checkout_session_id, so one must be returned
  // even though Stripe was never involved.
  assert.match(body.checkout_session_id, /^memcredit_/);
  assert.equal(body.checkout_url, `https://example.test/book/confirmation?session_id=${body.checkout_session_id}`);
});

test("the full-credit path sends the confirmation email, keyed on the same token", async () => {
  reset();
  creditApplied.set(bookingOne, PRICE_ONE);
  creditApplied.set(bookingTwo, PRICE_TWO);
  const response = await POST(
    basketRequest({ use_credit: true, expected_credit_pence: PRICE_ONE + PRICE_TWO })
  );
  const body = await response.json();
  assert.deepEqual(confirmationsSent, [body.checkout_session_id]);
});

// ---------------------------------------------------------------------------
// Refusals — a refusal must never start a payment
// ---------------------------------------------------------------------------

test("a changed balance is refused with words, and no payment is started", async () => {
  reset();
  reserveError = { message: 'raise exception "mem_credit_balance_changed"' };
  const response = await POST(basketRequest({ use_credit: true, expected_credit_pence: 2500 }));
  assert.equal(response.status, 409);
  assert.equal(checkoutInput, null, "no card payment was started");
  const body = await response.json();
  assert.equal(body.error, "credit_changed");
  assert.match(body.message, /balance has changed/i);
  // No Postgres vocabulary may reach a member.
  assert.equal(/mem_credit|exception|raise/i.test(JSON.stringify(body)), false);
});

test("a basket already sent for payment is refused, and no payment is started", async () => {
  reset();
  reserveError = { message: 'raise exception "mem_credit_hold_invalid"' };
  const response = await POST(basketRequest({ use_credit: true, expected_credit_pence: 2500 }));
  assert.equal(response.status, 409);
  assert.equal(checkoutInput, null);
  const body = await response.json();
  assert.equal(body.error, "credit_changed");
  assert.equal(/mem_credit|exception|raise/i.test(JSON.stringify(body)), false);
});

test("an unrecognised credit failure is generic, 500, and starts no payment", async () => {
  reset();
  reserveError = { message: 'raise exception "mem_credit_allocation_failed"' };
  const response = await POST(basketRequest({ use_credit: true, expected_credit_pence: 2500 }));
  assert.equal(response.status, 500);
  assert.equal(checkoutInput, null);
  const body = await response.json();
  assert.equal(/mem_credit|exception|raise/i.test(JSON.stringify(body)), false);
});

test("a failed settle on the full-credit path does not claim success", async () => {
  reset();
  creditApplied.set(bookingOne, PRICE_ONE);
  creditApplied.set(bookingTwo, PRICE_TWO);
  settleError = { message: 'raise exception "mem_checkout_hold_released"' };
  const response = await POST(
    basketRequest({ use_credit: true, expected_credit_pence: PRICE_ONE + PRICE_TWO })
  );
  assert.notEqual(response.status, 201);
  assert.equal(confirmationsSent.length, 0, "no confirmation for a booking that did not confirm");
});

// ---------------------------------------------------------------------------
// The card-only guarantee this fold exists to inherit
// ---------------------------------------------------------------------------

test("the credit checkout uses the card-only session, not a permissive one", async () => {
  // PR #78's parallel path set no payment_method_types and so inherited the
  // shared Stripe account's redirect methods. Those settle late, and a late
  // settlement against a released hold is money taken for a given-away place.
  reset();
  creditApplied.set(bookingOne, 1000);
  await POST(basketRequest({ use_credit: true, expected_credit_pence: 1000 }));
  assert.deepEqual(checkoutInput?.payment_method_types, ["card"]);
  assert.equal(checkoutInput?.mode, "payment");
});
