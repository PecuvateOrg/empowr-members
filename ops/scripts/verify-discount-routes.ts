import { test, mock } from "node:test";
import assert from "node:assert/strict";

const offeringA = "00000000-0000-4000-8000-000000000001";
const offeringB = "00000000-0000-4000-8000-000000000002";
const occurrence = "00000000-0000-4000-8000-000000000003";
const courseRun = "00000000-0000-4000-8000-000000000004";
const participant = "00000000-0000-4000-8000-000000000005";
let authorised = true;
let serviceCalls = 0;
let duplicate = false;
let discount = { id: offeringA, code: "SQUAD20", kind: "percentage", value: 20, offering_id: offeringA as string | null, expires_at: null as string | null, active: true };
let inserted: unknown;
const service = {
  from(table: string) {
    let operation = "read";
    let update: unknown;
    let single = false;
    const chain = {
      select() { return chain; }, eq() { return chain; }, order() { return chain; },
      insert(value: unknown) { operation = "insert"; inserted = value; return chain; },
      update(value: unknown) { operation = "update"; update = value; return chain; },
      single() { single = true; return finish(); },
      maybeSingle() { single = true; return finish(); },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return finish().then(resolve, reject); },
    };
    async function finish() {
      if (table === "mem_discount_codes") {
        if (operation === "insert") return duplicate ? { data: null, error: { code: "23505" } } : { data: { ...discount, ...inserted as object }, error: null };
        if (operation === "update") return { data: { ...discount, ...update as object }, error: null };
        return { data: single ? discount : [discount], error: null };
      }
      if (table === "mem_offerings") return { data: single ? { id: offeringA } : [{ id: offeringA, title: "Roller Squad", active: true }], error: null };
      return { data: { price_pence: table === "mem_course_runs" ? 2000 : undefined, offering: {
        id: table === "mem_occurrences" ? offeringA : offeringB,
        price_pence: 1000, early_bird_price_pence: 800, active: true,
      } }, error: null };
    }
    return chain;
  },
};
mock.module("next/server", { namedExports: { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } } });
mock.module("server-only", { namedExports: {} });
mock.module("@/lib/admin", { namedExports: { getAuthedAdmin: async () => authorised ? { id: participant } : null } });
mock.module("@/lib/auth", { namedExports: { getAuthedAccount: async () => authorised ? { account: { id: participant } } : null } });
mock.module("@/lib/supabase/service", { namedExports: { createServiceClient: () => { serviceCalls++; return service; } } });
const admin = await import("@/app/api/admin/discounts/route");
const quote = await import("@/app/api/discounts/quote/route");
const request = (body: unknown) => new Request("https://example.test/api", { method: "POST", body: JSON.stringify(body) });
const createInput = () => ({ code: " squad20 ", kind: "percentage", value: 20, offering_id: offeringA, expires_at: null });
const quoteInput = () => ({ discount_code: " squad20 ", items: [
  { occurrence_id: occurrence, participant_ids: [participant] },
  { course_run_id: courseRun, participant_ids: [participant] },
] });
test("all admin methods and quotes refuse unauthenticated access before service reads", async () => {
  authorised = false; serviceCalls = 0;
  for (const response of [await admin.GET(), await admin.POST(request(createInput())), await admin.PATCH(request({ id: offeringA, active: false })), await quote.POST(request(quoteInput()))]) assert.equal(response.status, 401);
  assert.equal(serviceCalls, 0); authorised = true;
});
test("admin creates a normalised scoped code and reports duplicates", async () => {
  let response = await admin.POST(request(createInput()));
  assert.equal(response.status, 201);
  assert.deepEqual(inserted, { ...createInput(), code: "SQUAD20" });
  duplicate = true; response = await admin.POST(request(createInput()));
  assert.equal(response.status, 409); duplicate = false;
});
test("admin rejects invalid percentages and prevents modifying terms through PATCH", async () => {
  assert.equal((await admin.POST(request({ ...createInput(), value: 101 }))).status, 400);
  assert.equal((await admin.PATCH(request({ id: offeringA, active: false, value: 100 }))).status, 400);
  const response = await admin.PATCH(request({ id: offeringA, active: false }));
  assert.equal(response.status, 200); assert.equal((await response.json()).discount.active, false);
});
test("mixed basket quotes discount only the selected session type", async () => {
  const response = await quote.POST(request(quoteInput()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "SQUAD20", subtotal_pence: 3000, discount_pence: 200, total_pence: 2800 });
});
test("global fixed discount applies to each place using server prices", async () => {
  discount = { ...discount, kind: "fixed", value: 500, offering_id: null };
  const response = await quote.POST(request({ ...quoteInput(), price_pence: 1 }));
  assert.deepEqual(await response.json(), { code: "SQUAD20", subtotal_pence: 3000, discount_pence: 1000, total_pence: 2000 });
});
test("paused and expired codes cannot be quoted", async () => {
  discount.active = false;
  assert.equal((await quote.POST(request(quoteInput()))).status, 400);
  discount.active = true; discount.expires_at = "2000-01-01T00:00:00Z";
  assert.equal((await quote.POST(request(quoteInput()))).status, 400);
});
