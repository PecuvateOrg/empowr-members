// Proves the Stripe webhook's private-booking branch.
//
// Run:  npm run verify:private-webhook      (from src/)
//
// The branch sits IN FRONT of the ordinary booking logic, so it has two jobs
// and this suite pins both:
//
//   1. Claim private-booking sessions and handle all four outcomes the booking
//      branch handles: paid -> confirm and email; replay -> nothing; paid after
//      the hold was released -> tell a human; completed unpaid -> tell a human;
//      expired -> release.
//   2. NOT claim anything else. An ordinary booking session, or a database
//      where the private tables do not exist yet, must fall through to the
//      existing logic exactly as before — including the failure mode where
//      returning 500 would make Stripe retry, and so block, every booking.
//
// Like verify-stranded-hold-alert, only the transport (sendEmail) and the
// database are faked. The route, the confirmation sender and the email
// builders run for real, so a misspelled reason or a builder that throws fails
// here rather than passing on a mocked notifications module.
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as shell from "@/lib/emails/shell";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

type Sent = { to: string; subject: string; html: string };
type Result = { data: unknown; error: unknown };
type Op = {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
};

let sent: Sent[] = [];
let ops: Op[] = [];
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let respond: (op: Op) => Result = () => ({ data: [], error: null });
let rpcRespond: (fn: string) => Result = () => ({ data: [], error: null });

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: {
    NextResponse: {
      json: (body: unknown, options?: ResponseInit) => Response.json(body, options),
    },
  },
});
mock.module("@/lib/email", {
  namedExports: {
    ...shell,
    sendEmail: async (params: Sent) => {
      sent.push(params);
      return true;
    },
  },
});
mock.module("@/lib/reconcile-brevo", {
  namedExports: { reconcileBrevo: async () => ({ skipped: true }) },
});
mock.module("@/lib/materialize-member-bookings", {
  namedExports: { reconcileMemberBookings: async () => ({}) },
});

function chain(table: string) {
  const op: Op = { table, op: "select", filters: {} };
  const run = () => {
    ops.push(op);
    return respond(op);
  };
  const self: Record<string, unknown> = {
    select: () => self,
    update: (values: Record<string, unknown>) => {
      op.op = "update";
      op.values = values;
      return self;
    },
    eq: (k: string, v: unknown) => {
      op.filters[k] = v;
      return self;
    },
    in: (k: string, v: unknown) => {
      op.filters[k] = v;
      return self;
    },
    maybeSingle: () => Promise.resolve(run()),
    then: (ok: (v: Result) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(ok, no),
  };
  return self;
}

mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      from: (table: string) => chain(table),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return rpcRespond(fn);
      },
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { email: "host@example.test" } }, error: null }),
        },
      },
    }),
  },
});

let event: unknown = null;
mock.module("@/lib/stripe", {
  namedExports: {
    getStripe: () => ({ webhooks: { constructEventAsync: async () => event } }),
  },
});

const { POST } = await import("@/app/api/webhooks/stripe/route");

const BOOKING = "0b3c9a55-8f63-4a3f-9b4e-5d7a2a1e6c11";
const TOKEN = "f".repeat(64);

function fire(type: string, session: Record<string, unknown> = {}) {
  event = {
    type,
    data: {
      object: {
        id: "cs_test_private",
        payment_status: "paid",
        payment_intent: "pi_test_private",
        amount_total: 20000,
        customer_details: { email: "host@example.test" },
        metadata: { kind: "private_booking", private_booking_id: BOOKING },
        ...session,
      },
    },
  };
  return POST(
    new Request("https://example.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    })
  );
}

const confirmedBirthday = {
  id: BOOKING,
  kind: "birthday",
  status: "confirmed",
  source: "online",
  venue_id: "venue-1",
  starts_at: "2026-10-31T15:00:00.000Z",
  ends_at: "2026-10-31T17:00:00.000Z",
  host_account_id: "account-1",
  paid_places: 10,
  total_places: 11,
  price_pence: 20000,
  hire_pence: 0,
  invite_token: TOKEN,
  places: [],
};

/** A database holding one private booking in the given state. */
function withPrivateRow(status: string) {
  respond = (op) => {
    if (op.table === "mem_private_bookings" && op.op === "select" && op.filters.stripe_checkout_session_id) {
      return { data: [{ id: BOOKING, status }], error: null };
    }
    if (op.table === "mem_private_bookings" && op.filters.id === BOOKING) {
      return { data: confirmedBirthday, error: null };
    }
    if (op.table === "mem_venues") {
      return { data: { name: "The Ladywell Centre", address: null, postcode: null }, error: null };
    }
    if (op.table === "mem_accounts") return { data: { user_id: "user-1", name: "Sam Host" }, error: null };
    return { data: [], error: null };
  };
}

const alerts = () => sent.filter((e) => e.subject.includes("action needed"));
const touched = (table: string) => ops.some((o) => o.table === table);

beforeEach(() => {
  sent = [];
  ops = [];
  rpcCalls = [];
  respond = () => ({ data: [], error: null });
  rpcRespond = () => ({ data: [], error: null });
});

test("an ordinary booking session falls through to the existing logic", async () => {
  const res = await fire("checkout.session.completed", { metadata: { booking_ids: "b1" } });
  assert.equal(res.status, 200);
  assert.equal(rpcCalls.length, 0, "private confirm must not run");
  assert.ok(
    ops.some((o) => o.table === "mem_bookings" && o.op === "update"),
    "the mem_bookings confirm must still run"
  );
});

test("paid: confirms through the RPC, emails the host the invite link, alerts staff", async () => {
  withPrivateRow("pending_payment");
  rpcRespond = (fn) => (fn === "mem_confirm_private_booking" ? { data: [{ id: BOOKING }], error: null } : { data: [], error: null });
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 200);
  assert.deepEqual(rpcCalls, [
    {
      fn: "mem_confirm_private_booking",
      args: { p_checkout_session_id: "cs_test_private", p_payment_intent_id: "pi_test_private" },
    },
  ]);
  const host = sent.find((e) => e.to === "host@example.test");
  const staff = sent.find((e) => e.to === "bookings@empowrcic.org");
  assert.ok(host, "host emailed");
  assert.ok(host.html.includes(`/private-bookings/join/${TOKEN}`), "host email carries the invite link");
  assert.ok(staff, "staff alerted");
  assert.ok(!staff.html.includes(TOKEN), "the invite capability must never reach the staff email");
  assert.equal(touched("mem_bookings"), false, "a private session must not reach mem_bookings");
});

test("replay: already confirmed sends nothing", async () => {
  withPrivateRow("confirmed");
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test("paid after the hold was released: a human is told, and told it is private", async () => {
  withPrivateRow("cancelled");
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 200);
  assert.equal(alerts().length, 1);
  assert.match(alerts()[0].subject, /Payment taken, no booking/);
  assert.ok(alerts()[0].html.includes(`private booking ${BOOKING}`));
});

test("completed but unpaid: a human is told", async () => {
  withPrivateRow("pending_payment");
  const res = await fire("checkout.session.completed", { payment_status: "unpaid" });
  assert.equal(res.status, 200);
  assert.equal(rpcCalls.length, 0);
  assert.equal(alerts().length, 1);
  assert.match(alerts()[0].subject, /without payment settling/);
});

test("expired: releases the private hold only", async () => {
  withPrivateRow("pending_payment");
  const res = await fire("checkout.session.expired");
  assert.equal(res.status, 200);
  const release = ops.find((o) => o.table === "mem_private_bookings" && o.op === "update");
  assert.ok(release, "private hold released");
  assert.equal(release.values?.status, "cancelled");
  assert.equal(release.filters.status, "pending_payment", "never touches a confirmed booking");
  assert.equal(touched("mem_bookings"), false);
});

test("our metadata but no row, paid: money may have moved against nothing — alert", async () => {
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 200);
  assert.equal(alerts().length, 1);
  assert.equal(touched("mem_bookings"), false);
});

test("schema not applied yet (PGRST205): falls through instead of blocking every booking", async () => {
  respond = (op) =>
    op.table === "mem_private_bookings"
      ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } }
      : { data: [], error: null };
  const res = await fire("checkout.session.completed", { metadata: { booking_ids: "b1" } });
  assert.equal(res.status, 200);
  assert.ok(ops.some((o) => o.table === "mem_bookings" && o.op === "update"));
});

test("any other lookup failure: 500 so Stripe retries", async () => {
  respond = (op) =>
    op.table === "mem_private_bookings"
      ? { data: null, error: { code: "08006", message: "connection failure" } }
      : { data: [], error: null };
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 500);
});

test("confirm RPC failure: 500 so Stripe retries, no email", async () => {
  withPrivateRow("pending_payment");
  rpcRespond = () => ({ data: null, error: { message: "boom" } });
  const res = await fire("checkout.session.completed");
  assert.equal(res.status, 500);
  assert.equal(sent.length, 0);
});
