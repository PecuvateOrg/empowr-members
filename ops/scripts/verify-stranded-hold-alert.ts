// Proves the Stripe webhook TELLS A HUMAN when it cannot finish a checkout.
//
// Added 2026-09-18 after a member paid for a session, held no booking, and
// nobody found out until he complained. Every branch covered here already
// logged before this suite existed — the defect was never a missing
// condition, it was that the condition only ever reached a Netlify function
// log that is live-only and unread.
//
// 🔑 WHAT THIS SUITE DELIBERATELY DOES NOT MOCK: `@/lib/notifications` and
// the email builder both run for real. Only the transport (`@/lib/email`
// sendEmail) is replaced, so an assertion here exercises the whole chain —
// route branch → sender → builder → recipient. Mocking the notifications
// module instead would have passed with a misspelled reason, an empty
// template or a builder that threw, which is the fixture trap this project
// has now been bitten by twice (see DEVLOG 2026-09-17).
//
// ⚠️ It still cannot prove delivery. Resend accepting a message is not the
// team reading it; that needs a real stranded hold against the live inbox.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
// `@/lib/email` re-exports the whole branded shell, and the other email
// builders import those names FROM it rather than from shell.ts. Replacing
// the module without carrying them forward breaks module instantiation for
// every sibling template, so the mock below spreads them back in.
import * as shell from "@/lib/emails/shell";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

type Sent = { to: string; subject: string; html: string };
let sentEmails: Sent[] = [];
let transportThrows = false;
let transportFails = false;

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: {
    NextResponse: {
      json: (body: unknown, options?: ResponseInit) =>
        Response.json(body, options),
    },
  },
});
mock.module("@/lib/email", {
  namedExports: {
    ...shell,
    sendEmail: async (params: Sent) => {
      if (transportThrows) throw new Error("resend exploded");
      sentEmails.push(params);
      return !transportFails;
    },
  },
});
// Not under test and both reach the network in anger.
mock.module("@/lib/reconcile-brevo", {
  namedExports: { reconcileBrevo: async () => ({ skipped: true }) },
});
mock.module("@/lib/materialize-member-bookings", {
  namedExports: { reconcileMemberBookings: async () => ({}) },
});

type QueryResult = { data: unknown; error: unknown };
let confirmResult: QueryResult = { data: [], error: null };
let lookupResult: QueryResult = { data: [], error: null };

// Minimal PostgREST-shaped chain. The route awaits at two different points
// — `.select()` after an `.update()`, and `.eq()` after a plain `.select()`
// — so the chain is thenable and answers with whichever result matches the
// operation it saw.
function chain() {
  let isUpdate = false;
  const self: Record<string, unknown> = {
    update() {
      isUpdate = true;
      return self;
    },
    select() {
      return self;
    },
    eq() {
      return self;
    },
    then(ok: (v: QueryResult) => unknown, no?: (e: unknown) => unknown) {
      return Promise.resolve(isUpdate ? confirmResult : lookupResult).then(
        ok,
        no
      );
    },
  };
  return self;
}
mock.module("@/lib/supabase/service", {
  namedExports: { createServiceClient: () => ({ from: () => chain() }) },
});

let event: unknown = null;
mock.module("@/lib/stripe", {
  namedExports: {
    getStripe: () => ({
      webhooks: { constructEventAsync: async () => event },
    }),
  },
});

const { POST } = await import("@/app/api/webhooks/stripe/route");
const { buildStaffStrandedHoldAlertEmail } = await import(
  "@/lib/emails/staff-stranded-hold-alert"
);
const { sendStaffStrandedHoldAlert } = await import("@/lib/notifications");

function completed(session: Record<string, unknown> = {}) {
  event = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_stranded",
        payment_status: "paid",
        payment_intent: "pi_test_stranded",
        amount_total: 700,
        customer_details: { email: "member@example.test" },
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

/** Alerts only — the member's own confirmation email shares this transport. */
function alerts() {
  return sentEmails.filter((e) => e.subject.includes("action needed"));
}

function reset() {
  sentEmails = [];
  transportThrows = false;
  transportFails = false;
  confirmResult = { data: [], error: null };
  lookupResult = { data: [], error: null };
}

test("a paid checkout whose holds were already released emails the team", async () => {
  reset();
  // Nothing left to confirm, and the rows that exist are not confirmed.
  confirmResult = { data: [], error: null };
  lookupResult = {
    data: [{ id: "booking-1", status: "cancelled" }],
    error: null,
  };
  const res = await completed();

  assert.equal(res.status, 200, "Stripe must not be told to retry");
  assert.equal(alerts().length, 1, "the team must be emailed, not just logged");
  const [mail] = alerts();
  assert.equal(mail.to, "bookings@empowrcic.org");
  assert.match(mail.subject, /Payment taken, no booking/);
  // The instruction, not just the label — an email naming the fault but not
  // the remedy is what an unread log already was.
  assert.match(mail.html, /Refund them, or rebook them/);
  assert.match(mail.html, /booking-1/, "staff need the id to find the member");
  assert.match(mail.html, /member@example\.test/);
  // formatPrice drops a zero remainder (£7, not £7.00) — asserted against the
  // shared helper's actual convention rather than a guessed one.
  assert.match(mail.html, /£7</, "the amount owed must be stated");
});

test("a paid checkout we could not check emails the team as unknown, not as fine", async () => {
  reset();
  confirmResult = { data: [], error: null };
  lookupResult = { data: null, error: { message: "connection reset" } };
  const res = await completed();

  assert.equal(res.status, 200);
  assert.equal(alerts().length, 1);
  const [mail] = alerts();
  assert.match(mail.subject, /booking status unknown/);
  assert.match(mail.html, /confirm by hand/);
  // 🔑 The database is what just failed. An alert that needed a second read
  // to name the member would fail in the exact case it exists for.
  assert.match(mail.html, /member@example\.test/);
  assert.match(mail.html, /None readable/);
});

test("a failed check reports ONLY that, even if rows came back with it", async () => {
  // 🔑 ONE CHECKOUT MUST PRODUCE ONE INSTRUCTION. PostgREST currently returns
  // `data: null` alongside an error, so this pairing should be unreachable —
  // but that is a property of the client, not a guarantee, and two alerts for
  // one payment would tell staff to refund and to check by hand at once.
  reset();
  confirmResult = { data: [], error: null };
  lookupResult = {
    data: [{ id: "booking-9", status: "cancelled" }],
    error: { message: "partial read" },
  };
  const res = await completed();

  assert.equal(res.status, 200);
  assert.equal(alerts().length, 1, "one checkout, one instruction");
  assert.match(alerts()[0].subject, /booking status unknown/);
});

test("a completed-but-unsettled checkout of OURS is no longer silent", async () => {
  reset();
  lookupResult = {
    data: [{ id: "booking-2", status: "pending_payment" }],
    error: null,
  };
  const res = await completed({ payment_status: "unpaid" });

  assert.equal(res.status, 200);
  assert.equal(
    alerts().length,
    1,
    "this branch returned having done nothing at all before 2026-09-18"
  );
  assert.match(alerts()[0].subject, /without payment settling/);
  assert.match(alerts()[0].html, /nothing here will confirm this booking/);
});

test("an unsettled checkout that is NOT ours stays silent", async () => {
  reset();
  // The Stripe account is shared with Empowr Heroes and fans every event to
  // every endpoint. No booking rows for this session id means it was never
  // this app's checkout. Alerting here would fill the inbox with another
  // product's payments until nobody reads it.
  lookupResult = { data: [], error: null };
  const res = await completed({ payment_status: "unpaid" });

  assert.equal(res.status, 200);
  assert.equal(alerts().length, 0, "another product's payment is not a fault");
});

test("a normal paid booking raises no alert at all", async () => {
  reset();
  confirmResult = { data: [{ id: "booking-3" }], error: null };
  lookupResult = { data: [], error: null };
  const res = await completed();

  assert.equal(res.status, 200);
  assert.equal(alerts().length, 0, "the happy path must not cry wolf");
});

test("the alert never throws, because money has already moved", async () => {
  // 🔑 LOAD-BEARING. A non-2xx makes Stripe retry a session it has already
  // charged, so a Resend outage must degrade to "nobody was told" and never
  // to "the payment is replayed".
  reset();
  transportThrows = true;
  await assert.doesNotReject(() =>
    sendStaffStrandedHoldAlert({
      reason: "paid_holds_released",
      checkoutSessionId: "cs_test_x",
      paymentIntentId: null,
      amountPence: 700,
      memberEmail: null,
      bookings: [],
    })
  );
  assert.equal(
    await sendStaffStrandedHoldAlert({
      reason: "check_failed",
      checkoutSessionId: "cs_test_x",
      paymentIntentId: null,
      amountPence: null,
      memberEmail: null,
      bookings: [],
    }),
    false,
    "a failed alert must report false, not pretend it sent"
  );

  // And the whole webhook survives it.
  reset();
  transportThrows = true;
  lookupResult = {
    data: [{ id: "booking-4", status: "cancelled" }],
    error: null,
  };
  assert.equal((await completed()).status, 200);
});

test("a rejected send is reported as false rather than swallowed", async () => {
  reset();
  transportFails = true;
  assert.equal(
    await sendStaffStrandedHoldAlert({
      reason: "completed_unpaid",
      checkoutSessionId: "cs_test_x",
      paymentIntentId: null,
      amountPence: null,
      memberEmail: null,
      bookings: [],
    }),
    false
  );
});

test("the three reasons say three different things to do", () => {
  const base = {
    checkoutSessionId: "cs_test_x",
    paymentIntentId: "pi_x",
    amountPence: 700,
    memberEmail: "m@example.test",
    bookings: [],
  };
  const built = (["paid_holds_released", "check_failed", "completed_unpaid"] as const).map(
    (reason) => buildStaffStrandedHoldAlertEmail({ ...base, reason })
  );
  const subjects = new Set(built.map((b) => b.subject));
  assert.equal(subjects.size, 3, "a shared subject hides which fault fired");
  const bodies = new Set(built.map((b) => b.html));
  assert.equal(bodies.size, 3, "a shared body gives staff the wrong remedy");
  for (const b of built) {
    assert.match(b.subject, /action needed/);
    assert.ok(b.html.length > 400, "an alert with no instruction is a log");
  }
});

test("member-supplied text cannot inject markup into the alert", () => {
  const { html } = buildStaffStrandedHoldAlertEmail({
    reason: "paid_holds_released",
    checkoutSessionId: "cs_test_x",
    paymentIntentId: null,
    amountPence: 700,
    memberEmail: "<script>alert(1)</script>@example.test",
    bookings: [{ id: "<img src=x>", status: "cancelled" }],
  });
  assert.ok(!html.includes("<script>"), "email addresses come from Stripe");
  assert.ok(!html.includes("<img src=x>"));
  assert.match(html, /&lt;script&gt;/);
});
