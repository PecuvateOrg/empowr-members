import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
const token = "a".repeat(64);
let now = new Date().toISOString();
let existingStatus = "open";
let expiryRefusal = false;
let signedIn = true;
let isAdmin = true;
let lookupError = false;
let holdError: string | null = null;
let providerError = false;
let existing: string | null = null;
let created: { params: Record<string, unknown>; options: unknown }[] = [];
let calls: { name: string; args: Record<string, unknown> }[] = [];
let updates: Record<string, unknown>[] = [];
const offer = { starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), paid_places: 10, expires_at: new Date(Date.now() + 48 * 3600000).toISOString() };
const booking = () => ({ id: "booking-test", kind: "birthday", starts_at: offer.starts_at,
  ends_at: new Date(Date.parse(offer.starts_at) + 2 * 3600000).toISOString(), total_places: 11,
  price_pence: 20000, hire_pence: 0, created_at: now, stripe_checkout_session_id: existing });
const account = { user: { id: "user", email: "test@example.test" }, account: { id: "account" } };
const service = {
  from: () => {
    const chain = {
      select: () => chain, eq: () => chain,
      update: (value: Record<string, unknown>) => { updates.push(value); return chain; },
      maybeSingle: async () => ({ data: lookupError ? null : offer, error: lookupError ? { code: "failed" } : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }; return chain;
  },
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { data: name === "mem_create_private_offer" ? { ...offer, token } : booking(), error: holdError ? { message: holdError } : null };
  },
};
mock.module("server-only", { namedExports: {} });
mock.module("next/server", { namedExports: { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } } });
mock.module("@/lib/auth", { namedExports: { getAuthedAccount: async () => signedIn ? account : null } });
mock.module("@/lib/admin", { namedExports: { getAuthedAdmin: async () => isAdmin ? { id: "staff" } : null } });
mock.module("@/lib/supabase/service", { namedExports: { createServiceClient: () => service } });
mock.module("@/lib/waivers", { namedExports: { checkWaivers: async () => [], persistWaiverMatches: async () => {} } });
mock.module("@/lib/request-origin", { namedExports: { requestOrigin: () => "https://example.test" } });
mock.module("@/lib/stripe", { namedExports: {
  HOLD_GRACE_MINUTES: 10, getOrCreateStripeCustomer: async () => "cus_test", stripeCustomerAccount: () => ({}),
  getStripe: () => ({ checkout: { sessions: {
    retrieve: async () => ({ status: existingStatus, url: "https://checkout.stripe.com/resume" }),
    create: async (params: Record<string, unknown>, options: unknown) => {
      created.push({ params, options });
      if (expiryRefusal) throw Object.assign(new Error("Invalid expiry"), { type: "StripeInvalidRequestError", param: "expires_at" });
      if (providerError) throw new Error("Provider timeout");
      return { id: "cs_test", url: "https://checkout.stripe.com/test", expires_at: params.expires_at };
    },
  } } }),
} });
const { POST: checkout } = await import("../../src/app/api/private-bookings/offers/[token]/route.ts");
const { POST: create } = await import("../../src/app/api/admin/private-bookings/offers/route.ts");
const request = (body = {}) => new Request("https://example.test/api/test", { method: "POST", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ token }) };
beforeEach(() => { now = new Date().toISOString(); existingStatus = "open"; expiryRefusal = false; signedIn = true; isAdmin = true; lookupError = false; holdError = null; providerError = false; existing = null; created = []; calls = []; updates = []; });
test("only admins can create offers; signed-out customers cannot start payment", async () => {
  isAdmin = false; assert.equal((await create(request())).status, 401);
  signedIn = false; assert.equal((await checkout(request(), context)).status, 401);
  assert.equal(calls.length, 0); assert.equal(created.length, 0);
});
test("admin creation uses verified actor and returns a shareable link", async () => {
  const response = await create(request({ ...offer, created_by: "forged" }));
  assert.equal(response.status, 201);
  assert.equal(calls[0].args.p_created_by, "staff");
  assert.match((await response.json()).url, /private-bookings\/offer\/a{64}$/);
});
test("checkout ignores forged prices and dates and uses a stable idempotency key", async () => {
  const response = await checkout(request({ price_pence: 1, paid_places: 1, starts_at: "2030-01-01" }), context);
  assert.equal(response.status, 201);
  assert.deepEqual(calls[0], { name: "mem_hold_private_offer", args: { p_token: token, p_account_id: "account" } });
  assert.deepEqual(created[0].options, { idempotencyKey: "private-offer-booking-test" });
  assert.equal((created[0].params.line_items as { price_data: { unit_amount: number } }[])[0].price_data.unit_amount, 20000);
  assert.ok(Number(created[0].params.expires_at) <= Date.parse(offer.expires_at) / 1000);
});
test("repeat request resumes an existing session without a second payment session", async () => {
  existing = "cs_existing";
  const response = await checkout(request(), context);
  assert.equal((await response.json()).checkout_url, "https://checkout.stripe.com/resume");
  assert.equal(created.length, 0);
});
test("expired offers and read failures never reach Stripe", async () => {
  holdError = "mem_private_offer_expired";
  assert.equal((await checkout(request(), context)).status, 409);
  lookupError = true;
  assert.equal((await checkout(request(), context)).status, 500);
  assert.equal(created.length, 0);
});
test("an uncertain provider timeout does not free a potentially payable hold", async () => {
  providerError = true;
  assert.equal((await checkout(request(), context)).status, 500);
  assert.equal(updates.some(value => value.status === "cancelled"), false);
});
test("retry after a timeout two minutes ago still reaches Stripe with the original idempotency key", async () => {
  now = new Date(Date.now() - 2 * 60000).toISOString();
  assert.equal((await checkout(request(), context)).status, 201);
  assert.deepEqual(created[0].options, { idempotencyKey: "private-offer-booking-test" });
});
test("a definitive expiry validation refusal releases a session-less attempt", async () => {
  expiryRefusal = true;
  assert.equal((await checkout(request(), context)).status, 500);
  assert.equal(updates.some(value => value.status === "cancelled"), true);
});
test("expired Stripe sessions release their hold without waiting for a webhook; completed payments do not", async () => {
  existing = "cs_existing"; existingStatus = "expired";
  assert.equal((await checkout(request(), context)).status, 409);
  assert.equal(updates.some(value => value.status === "cancelled"), true);
  updates = []; existingStatus = "complete";
  await checkout(request(), context);
  assert.equal(updates.length, 0);
});
