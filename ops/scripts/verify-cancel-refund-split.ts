/**
 * verify-cancel-refund-split.ts
 *
 * Run:  npm run verify:cancel-refund-split      (from src/)
 *
 * Pins the money on the self-serve cancellation path now that a booking can
 * be paid partly from credit notes.
 *
 * THE BUG THIS EXISTS TO STOP COMING BACK. Before credit, every penny of a
 * booking arrived by card, so `price_paid_pence` was both the price AND the
 * money taken — and the route refunded it directly. The moment credit can pay
 * part of a booking those two numbers diverge, and refunding the price hands
 * the member CARD CASH for the part they paid with a credit note. That is real
 * money leaving Empowr's account, on a trading platform, on the member's own
 * button — and nothing about it is visible to a typecheck: both figures are
 * `number`, and the wrong one is the one that used to be right.
 *
 * So the load-bearing assertions are the amounts: what Stripe is asked for,
 * that it is asked at all only when card money is actually at stake, and that
 * the email reports the split rather than the price.
 *
 * The second group is about the DURABLE CLAIM. mem_begin_booking_refund parks
 * the booking in `cancelled` and leaves it there until Stripe accepts, so a
 * retry legitimately arrives on a booking that is no longer `confirmed` and
 * may by then be inside the 48h cutoff. If either refusal fired on a retry,
 * the member would be left cancelled with no money back and no way through —
 * the worst outcome available on this route.
 *
 * WHAT THIS DOES NOT PROVE, and it is a real gap, not a caveat. The split
 * itself — card_pence = price_paid_pence - credit_applied_pence — is computed
 * in `mem_begin_booking_refund`, in SQL, under a row lock. The database is
 * faked here, so this suite pins that the route SPENDS the number the database
 * returns and never recomputes it; it says nothing about whether the SQL
 * subtracts correctly, and nothing about the trigger that releases the credit
 * on `refunded`. Both need a forced-rollback transaction against the live
 * schema that drives a real row through confirmed -> cancelled -> refunded and
 * asserts the allocations end up `released`. Until that has run, do not record
 * the credit refund as proven.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

const BOOKING = "00000000-0000-4000-8000-0000000000a1";
const ACCOUNT = "00000000-0000-4000-8000-0000000000a2";

type BookingFixture = {
  status: string;
  price_paid_pence: number | null;
  credit_applied_pence: number | null;
  stripe_payment_intent_id: string | null;
  /** Hours from now until the session starts — drives the real 48h policy. */
  startsInHours: number;
  refund_policy?: "standard" | "non_refundable";
};

/** What mem_begin_booking_refund reports back. Mirrors the SQL's row shape. */
type RefundFixture = {
  card_pence: number;
  credit_pence: number;
  payment_intent: string | null;
  completed: boolean;
  created_at: string;
};

let booking: BookingFixture;
let refundRow: RefundFixture;
let beginError: { message: string } | null = null;
/** An existing mem_booking_refunds row, i.e. a refund already claimed. */
let claimRow: { booking_id: string } | null = null;
let claimReadError: { message: string } | null = null;
let finishReturns = true;

let selects: Record<string, string> = {};
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let refundCreates: { params: Record<string, unknown>; options: Record<string, unknown> }[] = [];
let stripeStatus: string | null = "succeeded";
let emails: Record<string, unknown>[] = [];

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function bookingRow() {
  return {
    id: BOOKING,
    status: booking.status,
    price_paid_pence: booking.price_paid_pence,
    credit_applied_pence: booking.credit_applied_pence,
    stripe_payment_intent_id: booking.stripe_payment_intent_id,
    participant: { name: "Ada Lovelace" },
    occurrence: {
      starts_at: hoursFromNow(booking.startsInHours),
      ends_at: hoursFromNow(booking.startsInHours + 1),
      offering: { title: "Skate Jam", refund_policy: booking.refund_policy ?? "standard" },
    },
    course_run: null,
  };
}

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: {
    NextResponse: {
      json: (body: unknown, options?: ResponseInit) => Response.json(body, options),
    },
  },
});
mock.module("@/lib/auth", {
  namedExports: {
    getAuthedAccount: async () => ({
      account: { id: ACCOUNT },
      user: { email: "member@example.com" },
    }),
  },
});
// credits.ts imports this at module scope for memberCredits(); the refund path
// never touches it.
mock.module("@/lib/supabase/server", {
  namedExports: { createClient: async () => ({}) },
});
mock.module("@/lib/stripe", {
  namedExports: {
    getStripe: () => ({
      refunds: {
        create: async (
          params: Record<string, unknown>,
          options: Record<string, unknown>
        ) => {
          refundCreates.push({ params, options });
          return { id: "re_test", status: stripeStatus };
        },
      },
    }),
  },
});
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      from(table: string) {
        const chain = {
          select(cols: string) {
            selects[table] = cols;
            return chain;
          },
          eq() {
            return chain;
          },
          async maybeSingle() {
            if (table === "mem_bookings") return { data: bookingRow(), error: null };
            if (table === "mem_booking_refunds") {
              return { data: claimRow, error: claimReadError };
            }
            throw new Error(`unexpected table ${table}`);
          },
        };
        return chain;
      },
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        if (name === "mem_begin_booking_refund") {
          return { data: beginError ? null : refundRow, error: beginError };
        }
        if (name === "mem_finish_booking_refund") {
          return { data: finishReturns, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      },
    }),
  },
});
mock.module("@/lib/notifications", {
  namedExports: {
    sendBookingCancellationEmail: async (_to: string, data: Record<string, unknown>) => {
      emails.push(data);
    },
  },
});

const { POST } = await import("@/app/api/bookings/[id]/cancel/route");

/** Resets to the ordinary case: £50 booking, £20 of it paid from credit. */
function reset() {
  booking = {
    status: "confirmed",
    price_paid_pence: 5000,
    credit_applied_pence: 2000,
    stripe_payment_intent_id: "pi_live_123",
    startsInHours: 120,
  };
  refundRow = {
    card_pence: 3000,
    credit_pence: 2000,
    payment_intent: "pi_live_123",
    completed: false,
    created_at: new Date().toISOString(),
  };
  beginError = null;
  claimRow = null;
  claimReadError = null;
  finishReturns = true;
  selects = {};
  rpcCalls = [];
  refundCreates = [];
  stripeStatus = "succeeded";
  emails = [];
}

async function cancel() {
  const response = await POST(new Request("http://localhost/x", { method: "POST" }), {
    params: Promise.resolve({ id: BOOKING }),
  });
  return { response, body: (await response.json()) as Record<string, unknown> };
}

const rpcNames = () => rpcCalls.map((c) => c.name);

test("only the CARD portion reaches Stripe — never the price", async () => {
  reset();
  const { response, body } = await cancel();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(refundCreates.length, 1);
  assert.equal(
    refundCreates[0].params.amount,
    3000,
    "Stripe must be asked for price - credit, not price"
  );
  assert.notEqual(
    refundCreates[0].params.amount,
    5000,
    "refunding price_paid_pence hands credit back as card cash"
  );
  assert.equal(refundCreates[0].params.payment_intent, "pi_live_123");
  assert.equal(refundCreates[0].params.reason, "requested_by_customer");
});

test("the card refund carries a stable idempotency key keyed on the booking", async () => {
  reset();
  await cancel();
  assert.equal(
    refundCreates[0].options.idempotencyKey,
    `members-booking-refund-${BOOKING}`,
    "a retry must reach the SAME Stripe refund, not create a second one"
  );
});

test("the email reports the split, not the price", async () => {
  reset();
  await cancel();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].amountPence, 3000, "card refund line must be the card money");
  assert.equal(emails[0].creditPence, 2000, "credit returned must be stated");
});

test("a booking paid ENTIRELY from credit cancels, and Stripe is never called", async () => {
  reset();
  booking.credit_applied_pence = 5000;
  booking.stripe_payment_intent_id = null;
  refundRow = { ...refundRow, card_pence: 0, credit_pence: 5000, payment_intent: null };
  const { response, body } = await cancel();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(refundCreates.length, 0, "no card money is at stake, so no Stripe call");
  assert.ok(
    rpcNames().includes("mem_finish_booking_refund"),
    "the credit must still be released, which only 'refunded' does"
  );
  assert.equal(emails[0].amountPence, 0);
  assert.equal(emails[0].creditPence, 5000);
});

test("a card booking with no payment intent is refused truthfully, and NOTHING is claimed", async () => {
  reset();
  booking.stripe_payment_intent_id = null;
  const { response, body } = await cancel();
  assert.equal(response.status, 409);
  assert.match(String(body.error), /enquiries@empowrcic\.org/);
  assert.deepEqual(rpcCalls, [], "no refund may be claimed for a booking that cannot be refunded");
  assert.equal(refundCreates.length, 0);
});

test("a £0 booking is refused rather than claimed", async () => {
  reset();
  booking.price_paid_pence = 0;
  booking.credit_applied_pence = 0;
  const { response } = await cancel();
  assert.equal(response.status, 409);
  assert.deepEqual(rpcCalls, []);
});

test("the booking read asks for credit_applied_pence and keeps the local course-run times", async () => {
  reset();
  await cancel();
  const cols = selects["mem_bookings"];
  assert.match(cols, /credit_applied_pence/, "without it the card portion cannot be known");
  assert.match(cols, /starts_at_local/, "courseRunWhen needs these — PR #78's copy dropped them");
  assert.match(cols, /ends_at_local/);
});

test("a RETRY on a booking already parked in 'cancelled' completes the refund", async () => {
  reset();
  booking.status = "cancelled";
  claimRow = { booking_id: BOOKING };
  const { response, body } = await cancel();
  assert.equal(
    response.status,
    200,
    "the durable claim leaves the row 'cancelled'; refusing here strands the member"
  );
  assert.ok(rpcNames().includes("mem_begin_booking_refund"), JSON.stringify(body));
});

test("a cancelled booking with NO claim is still refused", async () => {
  reset();
  booking.status = "cancelled";
  const { response, body } = await cancel();
  assert.equal(response.status, 409);
  assert.match(String(body.error), /Only confirmed bookings/);
  assert.deepEqual(rpcCalls, []);
});

test("a failed claim lookup is a 500, never dressed up as a policy refusal", async () => {
  reset();
  booking.status = "cancelled";
  claimReadError = { message: "PGRST205" };
  const { response, body } = await cancel();
  assert.equal(response.status, 500);
  assert.doesNotMatch(
    String(body.error),
    /Only confirmed bookings/,
    "a broken query must not answer as if it had looked"
  );
  assert.deepEqual(rpcCalls, []);
});

test("past the 48h cutoff is refused when no refund is in flight", async () => {
  reset();
  booking.startsInHours = 12;
  const { response } = await cancel();
  assert.equal(response.status, 403);
  assert.deepEqual(rpcCalls, []);
});

test("past the cutoff, a refund ALREADY claimed is still completed", async () => {
  reset();
  booking.startsInHours = 12;
  booking.status = "cancelled";
  claimRow = { booking_id: BOOKING };
  const { response, body } = await cancel();
  assert.equal(
    response.status,
    200,
    "the cutoff was met when the claim was made; a retry must not be judged again"
  );
  assert.ok(rpcNames().includes("mem_finish_booking_refund"), JSON.stringify(body));
});

test("a PENDING Stripe refund is accepted — the money is on its way back", async () => {
  reset();
  stripeStatus = "pending";
  const { response, body } = await cancel();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.ok(
    rpcNames().includes("mem_finish_booking_refund"),
    "treating pending as a failure stranded the booking with the credit unreleased while the card WAS refunded"
  );
});

test("a FAILED Stripe refund does not finish the refund, and the member is not told it worked", async () => {
  reset();
  stripeStatus = "failed";
  const { response, body } = await cancel();
  assert.equal(response.status, 503);
  assert.ok(
    !rpcNames().includes("mem_finish_booking_refund"),
    "'refunded' releases the credit — it must not be reached when no money moved"
  );
  assert.equal(emails.length, 0);
  assert.match(String(body.error), /won't be refunded twice/);
});

test("a replay of an already-completed refund does not email the member again", async () => {
  reset();
  refundRow = { ...refundRow, completed: true };
  const { response } = await cancel();
  assert.equal(response.status, 200);
  assert.equal(emails.length, 0, "the email is gated on `first`");
  assert.equal(refundCreates.length, 0, "a completed refund must not touch Stripe again");
});
