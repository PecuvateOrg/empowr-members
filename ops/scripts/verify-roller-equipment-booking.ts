// Exercises the real POST handler with isolated database/payment adapters.
// No network, real accounts or payments are used.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const child = "00000000-0000-4000-8000-000000000001";
const occurrence = "00000000-0000-4000-8000-000000000002";
const booking = "00000000-0000-4000-8000-000000000003";
const account = "00000000-0000-4000-8000-000000000004";
const events: string[] = [];
let failSave = false;
let signedIn = true;
let wrongOwner = false;
let title = "Roller Quad Camp";
let saved: unknown;
const equipment = { skate_choice: "hire", hire_skate_size: "C10 – UK 1", protective_gear: "provided" };
const service = {
  from(table: string) {
    let update: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const chain = {
      select() { return chain; },
      in() { return chain; },
      eq(key: string, value: unknown) { filters[key] = value; return chain; },
      update(value: Record<string, unknown>) { update = value; return chain; },
      single() { return finish(); },
      maybeSingle() { return finish(); },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return finish().then(resolve, reject); },
    };
    async function finish() {
      if (table === "mem_participants") return { data: wrongOwner ? [] : [{ id: child, name: "Example Child", dob: "2017-01-01", person_id: null }], error: null };
      if (table === "mem_occurrences") return { data: { starts: "2030-09-01T09:00:00Z", ends: "2030-09-01T15:00:00Z", offering: { id: occurrence, title, slug: title === "Roller Quad Camp" ? "roller-quad-camp" : "other", type: "camp", age_min: 5, age_max: 17 } }, error: null };
      if (table === "mem_bookings" && update?.skate_choice) {
        events.push("save"); saved = update;
        assert.equal(filters.id, booking); assert.equal(filters.account_id, account); assert.equal(filters.status, "pending_payment");
        return failSave ? { data: null, error: { message: "Simulated storage failure" } } : { data: { id: booking }, error: null };
      }
      if (update?.status === "cancelled") { events.push("release"); assert.equal(filters.status, "pending_payment"); }
      else if (update?.stripe_checkout_session_id) events.push("link");
      return { data: null, error: null };
    }
    return chain;
  },
  async rpc() { events.push("hold"); return { data: [{ id: booking, participant_id: child, price_paid_pence: 4500 }], error: null }; },
};
mock.module("next/server", { namedExports: { NextResponse: { json: (body: unknown, options: ResponseInit) => Response.json(body, options) } } });
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/auth", { namedExports: { getAuthedAccount: async () => signedIn ? { account: { id: account }, user: { email: "fixture@example.test" } } : null } });
mock.module("@/lib/supabase/service", { namedExports: { createServiceClient: () => service } });
mock.module("@/lib/waivers", { namedExports: { checkWaivers: async () => [{ participantId: child, signed: true }], persistWaiverMatches: async () => {} } });
mock.module("@/lib/departure-consent", { namedExports: { recordDepartureConsents: async () => {} } });
mock.module("@/lib/membership", { namedExports: { coverForOccurrence: async () => [] } });
mock.module("@/lib/request-origin", { namedExports: { requestOrigin: () => "https://example.test" } });
mock.module("@/lib/stripe", { namedExports: {
  HOLD_GRACE_MINUTES: 10,
  stripeCustomerAccount: () => ({}),
  getOrCreateStripeCustomer: async () => "fixture_customer",
  getStripe: () => ({ checkout: { sessions: { create: async () => { events.push("checkout"); return { id: "fixture_session", url: "https://example.test/checkout", expires_at: 9999999999 }; } } } }),
} });
const { POST } = await import("@/app/api/bookings/route");
const { readRollerEquipment } = await import("@/lib/roller-equipment-read");
function reset() { events.length = 0; failSave = false; signedIn = true; wrongOwner = false; title = "Roller Quad Camp"; saved = undefined; }
function request(entries: unknown[] = [{ participant_id: child, equipment }]) {
  return new Request("https://example.test/api/bookings", { method: "POST", body: JSON.stringify({ occurrence_id: occurrence, participant_ids: [child], roller_equipment: entries }) });
}

test("POST saves the child's equipment before creating Checkout", async () => {
  reset(); const response = await POST(request());
  assert.equal(response.status, 201); assert.deepEqual(events, ["hold", "save", "checkout", "link"]); assert.deepEqual(saved, equipment);
});
test("POST refuses payment and releases holds if equipment storage fails", async () => {
  reset(); failSave = true; const response = await POST(request());
  assert.equal(response.status, 500); assert.deepEqual(events, ["hold", "save", "release"]);
});
test("POST rejects missing equipment before holding or taking payment", async () => {
  reset(); assert.equal((await POST(request([]))).status, 400); assert.deepEqual(events, []);
});
test("POST rejects invalid equipment before holding or taking payment", async () => {
  reset(); assert.equal((await POST(request([{ participant_id: child, equipment: { ...equipment, hire_skate_size: "UK 8" } }]))).status, 400); assert.deepEqual(events, []);
});
test("POST keeps authentication and participant ownership gates", async () => {
  reset(); signedIn = false; assert.equal((await POST(request())).status, 401); assert.deepEqual(events, []);
  reset(); wrongOwner = true; assert.equal((await POST(request())).status, 400); assert.deepEqual(events, []);
});
test("POST leaves unrelated bookings working without equipment", async () => {
  reset(); title = "Other camp"; assert.equal((await POST(request([]))).status, 201); assert.deepEqual(events, ["hold", "checkout", "link"]);
});

test("equipment read failure reports unavailable instead of trustworthy zero totals", async () => {
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: new Error("Fixture read failure") }) }) }) };
  const result = await readRollerEquipment(db as never, [booking]);
  assert.equal(result.unavailable, true); assert.equal(result.byBooking.size, 0);
});

test("equipment read preserves valid snapshots and marks historical/invalid choices missing", async () => {
  const db = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id: booking, ...equipment }, { id: child, skate_choice: null, hire_skate_size: null, protective_gear: null }], error: null }) }) }) };
  const result = await readRollerEquipment(db as never, [booking, child]);
  assert.equal(result.unavailable, false); assert.equal(result.byBooking.size, 1); assert.deepEqual(result.byBooking.get(booking), equipment);
});
