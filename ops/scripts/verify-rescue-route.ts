// Proves the rescue route cannot give away a place that was never paid for.
//
// The whole safety argument rests on one thing: STRIPE decides whether money
// exists, not the person pressing the button and not the request body. Seven
// code paths in this app write status='cancelled', and two of them are
// deliberate (an admin releasing a hold, Empowr cancelling a session). On every
// column a deliberate release is indistinguishable from a payment we lost — so
// if this route could be driven by a typed or guessed payment reference it
// would be a way to restore places somebody meant to free.
//
// The assertions that matter most are the NEGATIVE ones: that no database call
// happens at all when Stripe does not confirm payment.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let staff: { id: string; email: string } | null = {
  id: "staff-uuid",
  email: "door@empowrcic.org",
};
let adminEmails = ["admin@empowrcic.org"];

let stripeSession: Record<string, unknown> | null = {
  payment_status: "paid",
  payment_intent: "pi_from_stripe",
};
let stripeThrows = false;

let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let rpcResult: { data: unknown; error: unknown } = {
  data: [{ id: "booking-1", rescued_over_capacity: false }],
  error: null,
};

let emailCalls: string[] = [];
let emailSucceeds = true;

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: {
    NextResponse: {
      json: (body: unknown, options?: ResponseInit) =>
        Response.json(body, options),
    },
  },
});
mock.module("@/lib/admin", {
  namedExports: {
    getAuthedCheckinStaff: async () => staff,
    isAdminEmail: (email: string | null | undefined) =>
      Boolean(email) && adminEmails.includes(String(email).toLowerCase()),
  },
});
mock.module("@/lib/stripe", {
  namedExports: {
    getStripe: () => ({
      checkout: {
        sessions: {
          retrieve: async () => {
            if (stripeThrows) throw new Error("no such checkout.session");
            return stripeSession;
          },
        },
      },
    }),
  },
});
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return rpcResult;
      },
    }),
  },
});
mock.module("@/lib/notifications", {
  namedExports: {
    sendBookingConfirmationForSession: async (
      _service: unknown,
      sessionId: string
    ) => {
      emailCalls.push(sessionId);
      return emailSucceeds;
    },
  },
});

const { POST } = await import("@/app/api/admin/rescue/route");

function rescue(body: unknown = { checkout_session_id: "cs_live_abc" }) {
  return POST(
    new Request("https://example.test/api/admin/rescue", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

function reset() {
  staff = { id: "staff-uuid", email: "door@empowrcic.org" };
  adminEmails = ["admin@empowrcic.org"];
  stripeSession = { payment_status: "paid", payment_intent: "pi_from_stripe" };
  stripeThrows = false;
  rpcCalls = [];
  rpcResult = {
    data: [{ id: "booking-1", rescued_over_capacity: false }],
    error: null,
  };
  emailCalls = [];
  emailSucceeds = true;
}

test("nobody signed out can rescue anything", async () => {
  reset();
  staff = null;
  assert.equal((await rescue()).status, 401);
  assert.equal(rpcCalls.length, 0, "an unauthorised call must not reach the DB");
});

test("an unpaid checkout is refused WITHOUT touching the database", async () => {
  // 🔑 THE CENTRAL ASSERTION. If this ever passes with rpcCalls.length > 0,
  // the route has become a way to restore a place nobody paid for.
  reset();
  stripeSession = { payment_status: "unpaid", payment_intent: null };
  const res = await rescue();

  assert.equal(res.status, 409);
  assert.equal(rpcCalls.length, 0, "no payment, no database write");
  assert.match((await res.json()).error, /not paid/);
});

test("a checkout Stripe has never heard of is refused, not guessed at", async () => {
  reset();
  stripeThrows = true;
  const res = await rescue();

  assert.equal(res.status, 404);
  assert.equal(rpcCalls.length, 0);
});

test("the payment reference comes from Stripe, never from the request", async () => {
  // A caller supplying their own reference must not be able to steer this.
  // Typing one is how a deliberately-released place gets restored by mistake.
  reset();
  const res = await rescue({
    checkout_session_id: "cs_live_abc",
    payment_intent_id: "pi_TYPED_BY_A_HUMAN",
    stripe_payment_intent_id: "pi_ALSO_TYPED",
  });

  assert.equal(res.status, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(
    rpcCalls[0].args.p_payment_intent_id,
    "pi_from_stripe",
    "the reference written to the booking must be the one Stripe returned"
  );
});

test("a successful rescue emails the member their ticket", async () => {
  reset();
  const res = await rescue();
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.restored, 1);
  assert.deepEqual(emailCalls, ["cs_live_abc"]);
  assert.equal(body.emailed, true);
  // Reuses the webhook's own sender, keyed on the checkout id the swept row
  // still carries - so there is no second copy of this logic to drift.
  assert.equal(rpcCalls[0].args.p_user_id, "staff-uuid", "audit trail");
});

test("a failed email does not fail the rescue", async () => {
  // The place and the payment are already recorded. Failing here would invite
  // staff to press the button again on a booking that is already restored.
  reset();
  emailSucceeds = false;
  const res = await rescue();

  assert.equal(res.status, 200);
  assert.equal((await res.json()).emailed, false);
});

test("door staff cannot put a session over capacity, admins can", async () => {
  reset();
  const refused = await rescue({
    checkout_session_id: "cs_live_abc",
    allow_over_capacity: true,
  });
  assert.equal(refused.status, 403);
  assert.equal(rpcCalls.length, 0, "refused before the database, not after");

  reset();
  staff = { id: "admin-uuid", email: "admin@empowrcic.org" };
  const allowed = await rescue({
    checkout_session_id: "cs_live_abc",
    allow_over_capacity: true,
  });
  assert.equal(allowed.status, 200);
  assert.equal(rpcCalls[0].args.p_allow_over_capacity, true);
});

test("a full session offers an override to an admin and not to the door", async () => {
  reset();
  rpcResult = {
    data: null,
    error: { message: 'mem_capacity_exceeded' },
  };
  const door = await rescue();
  assert.equal(door.status, 409);
  assert.equal(
    (await door.json()).canOverride,
    false,
    "door staff must not be told an override exists"
  );

  rpcCalls = [];
  staff = { id: "admin-uuid", email: "admin@empowrcic.org" };
  const admin = await rescue();
  assert.equal(admin.status, 409);
  assert.equal((await admin.json()).canOverride, true);
});

test("a cancelled or past session is refused with a refund instruction", async () => {
  reset();
  rpcResult = { data: null, error: { message: 'mem_not_bookable' } };
  const res = await rescue();

  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Refund the member instead/);
});

test("an already-confirmed or refunded checkout is refused", async () => {
  reset();
  rpcResult = { data: null, error: { message: 'mem_not_rescuable' } };
  const res = await rescue();

  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /already/);
});

test("a member who rebooked themselves is told to refund, not given two places", async () => {
  // 🔑 THE LIKELIEST REAL OUTCOME. Someone whose payment went missing often
  // just books again, and nobody ever hears about the first one — at least one
  // member did exactly this on 2026-09-17. Restoring the stranded row would
  // hand them a second place for their second payment. Verified against the
  // real partial unique index on (participant_id, occurrence_id), which only
  // covers pending_payment and confirmed.
  reset();
  rpcResult = { data: null, error: { message: 'mem_already_booked' } };
  const res = await rescue();

  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.match(error, /already holds a place/);
  assert.match(error, /refund the duplicate payment/i, "the remedy must be named");
});

test("an unmapped database error never leaks its message to a door tablet", async () => {
  reset();
  rpcResult = {
    data: null,
    error: { message: 'permission denied for relation mem_bookings' },
  };
  const res = await rescue();

  assert.equal(res.status, 500);
  const { error } = await res.json();
  assert.ok(!error.includes("permission denied"), "raw Postgres text must not surface");
});

test("a paid session with no payment reference is refused rather than invented", async () => {
  reset();
  stripeSession = { payment_status: "paid", payment_intent: null };
  const res = await rescue();

  assert.equal(res.status, 409);
  assert.equal(rpcCalls.length, 0);
});

test("an empty reference is rejected before Stripe is called", async () => {
  reset();
  assert.equal((await rescue({ checkout_session_id: "   " })).status, 400);
  assert.equal(rpcCalls.length, 0);
});
