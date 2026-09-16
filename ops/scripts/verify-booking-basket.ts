import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const participant = "00000000-0000-4000-8000-000000000001";
const occurrenceOne = "00000000-0000-4000-8000-000000000002";
const courseRun = "00000000-0000-4000-8000-000000000003";
const bookingOne = "00000000-0000-4000-8000-000000000004";
const bookingTwo = "00000000-0000-4000-8000-000000000005";
const account = "00000000-0000-4000-8000-000000000006";

let rpcError: { message: string } | null = null;
let rpcCall: { name: string; args: Record<string, unknown> } | null = null;
let checkoutInput: Record<string, unknown> | null = null;

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
        const id = filters.id as string;
        return {
          data: {
            starts: "2030-09-01T10:00:00Z",
            ends: "2030-09-01T11:00:00Z",
            offering: {
              id,
              title: "Skate Jam",
              slug: "skate-jam",
              type: "lesson",
              age_min: 5,
              age_max: 17,
            },
          },
          error: null,
        };
      }
      if (table === "mem_course_runs") {
        return {
          data: {
            starts: "2030-10-01",
            ends: "2030-10-22",
            label: "October block",
            starts_at_local: "19:30:00",
            ends_at_local: "21:30:00",
            offering: {
              id: courseRun,
              title: "Beginners Foundation",
              slug: "beginners-foundation",
              type: "course",
              age_min: 8,
              age_max: 17,
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
    rpcCall = { name, args };
    return {
      data: rpcError
        ? null
        : name === "mem_hold_bookings"
          ? [
              { id: bookingOne, participant_id: participant, occurrence_id: occurrenceOne, course_run_id: null, price_paid_pence: 1000 },
            ]
          : [
            { id: bookingOne, participant_id: participant, occurrence_id: occurrenceOne, course_run_id: null, price_paid_pence: 1000 },
            { id: bookingTwo, participant_id: participant, occurrence_id: null, course_run_id: courseRun, price_paid_pence: 5500 },
          ],
      error: rpcError,
    };
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
      account: { id: account },
      user: { email: "fixture@example.test" },
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
            return { id: "fixture_session", url: "https://example.test/checkout", expires_at: 9999999999 };
          },
        },
      },
    }),
  },
});

const { POST } = await import("@/app/api/bookings/route");
const { buildBookingConfirmationEmail } = await import("@/lib/emails/booking-confirmation");
const basketStorage = await import("@/lib/booking-basket");

const localValues = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localValues.get(key) ?? null,
    setItem: (key: string, value: string) => localValues.set(key, value),
    removeItem: (key: string) => localValues.delete(key),
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { dispatchEvent: () => true },
});

function basketRequest() {
  return new Request("https://example.test/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      items: [
        { occurrence_id: occurrenceOne, participant_ids: [participant] },
        { course_run_id: courseRun, participant_ids: [participant] },
      ],
    }),
  });
}

test("a basket uses the atomic RPC and creates one itemised Checkout", async () => {
  rpcError = null;
  rpcCall = null;
  checkoutInput = null;
  const response = await POST(basketRequest());
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.checkout_session_id, "fixture_session");
  assert.equal(rpcCall?.name, "mem_hold_booking_basket");
  assert.equal((rpcCall?.args.p_items as unknown[]).length, 2);
  assert.equal((checkoutInput?.line_items as unknown[]).length, 2);
  assert.equal(checkoutInput?.cancel_url, "https://example.test/basket");
});

test("the basket route is protected by the member middleware", () => {
  const middleware = readFileSync("middleware.ts", "utf8");
  assert.match(middleware, /MEMBER_PREFIXES\s*=\s*\[[^\]]*"\/basket"/);
});

test("a one-item basket still returns to the basket when Checkout is cancelled", async () => {
  rpcError = null;
  rpcCall = null;
  checkoutInput = null;
  const response = await POST(
    new Request("https://example.test/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        items: [{ occurrence_id: occurrenceOne, participant_ids: [participant] }],
      }),
    })
  );
  assert.equal(response.status, 201);
  assert.equal(rpcCall?.name, "mem_hold_bookings");
  assert.equal(checkoutInput?.cancel_url, "https://example.test/basket");
});

test("one unavailable target blocks the whole basket before Checkout", async () => {
  rpcError = { message: "mem_capacity_exceeded" };
  rpcCall = null;
  checkoutInput = null;
  const response = await POST(basketRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "capacity");
  assert.equal(checkoutInput, null);
});

test("a basket rejects duplicate targets and more than ten places", async () => {
  const duplicate = await POST(
    new Request("https://example.test/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        items: [
          { occurrence_id: occurrenceOne, participant_ids: [participant] },
          { occurrence_id: occurrenceOne, participant_ids: [participant] },
        ],
      }),
    })
  );
  assert.equal(duplicate.status, 400);

  const tooMany = await POST(
    new Request("https://example.test/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            occurrence_id: occurrenceOne,
            participant_ids: Array.from({ length: 11 }, (_, index) =>
              `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`
            ),
          },
        ],
      }),
    })
  );
  assert.equal(tooMany.status, 400);
});

test("the confirmation email keeps each basket session's details separate", () => {
  const email = buildBookingConfirmationEmail({
    amountPaidPence: 2500,
    groups: [
      {
        offeringTitle: "Skate Jam",
        when: "Saturday, 2–4pm",
        venue: { name: "Mountview", address: null, postcode: "SE4" },
        kitList: "Helmet",
        participantNames: ["Example Child"],
        ticketUrls: ["https://example.test/ticket/one"],
        amountPaidPence: 1000,
        refundPolicy: "standard",
      },
      {
        offeringTitle: "Skate Skills",
        when: "Sunday, 10–11am",
        venue: { name: "The Bridge", address: null, postcode: "SE20" },
        kitList: null,
        participantNames: ["Example Child"],
        ticketUrls: ["https://example.test/ticket/two"],
        amountPaidPence: 1500,
        refundPolicy: "non_refundable",
      },
    ],
  });
  assert.match(email.subject, /Bookings confirmed/);
  for (const detail of ["Skate Jam", "Mountview", "Skate Skills", "The Bridge", "£25"]) {
    assert.match(email.html, new RegExp(detail));
  }
});

test("checkout success removes only the cards sent to that Checkout", () => {
  localValues.clear();
  const base = {
    participant_ids: [participant],
    departure_consents: [],
    roller_equipment: [],
    early_bird: false,
    venue: null,
    participantNames: ["Example Child"],
    unitPricePence: 1000,
  };
  const first = {
    ...base,
    key: `occurrence:${occurrenceOne}`,
    occurrence_id: occurrenceOne,
    offeringTitle: "Skate Jam",
    when: "First date",
    bookingPath: `/book/${occurrenceOne}`,
  };
  const later = {
    ...base,
    key: "occurrence:later",
    occurrence_id: "later",
    offeringTitle: "Later booking",
    when: "Later date",
    bookingPath: "/book/later",
  };

  basketStorage.writeBasket(account, [first]);
  basketStorage.rememberBasketCheckout(account, "checkout-one", [first.key]);
  basketStorage.writeBasket(account, [first, later]);
  basketStorage.completeBasketCheckout(account, "checkout-one");
  assert.deepEqual(
    basketStorage.readBasket(account).map((item) => item.key),
    [later.key]
  );
});

test("a pay-now confirmation with no basket marker leaves the basket alone", () => {
  const before = basketStorage.readBasket(account);
  basketStorage.completeBasketCheckout(account, "pay-now-checkout");
  assert.deepEqual(basketStorage.readBasket(account), before);
});
