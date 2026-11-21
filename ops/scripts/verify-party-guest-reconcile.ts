/**
 * verify-party-guest-reconcile.ts
 *
 * Run:  npm run verify:party-guest-reconcile     (from src/)
 *
 * Covers POST /api/admin/private-bookings/[id]/guests, the staff fix for a
 * party guest who was added and signed but never registered (#194). What
 * matters:
 *   - only admins can use it;
 *   - the waiver checked is the CHILD'S OWN FAMILY'S (their account email),
 *     never the staff member's, and with no waiver nothing is written;
 *   - the place goes on the child's own account, never as the birthday person;
 *   - the party's own rules (already registered, full) come back as refusals.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("server-only", { namedExports: {} });

let admin: { id: string; email: string } | null = { id: "staff-1", email: "staff@example.org" };
mock.module("@/lib/admin", { namedExports: { getAuthedAdmin: async () => admin } });

let waiverSigned = true;
const waiverEmails: string[] = [];
mock.module("@/lib/waivers", {
  namedExports: {
    checkWaivers: async (email: string, ps: { id: string }[]) => {
      waiverEmails.push(email);
      return ps.map((p) => ({ participantId: p.id, signed: waiverSigned }));
    },
    persistWaiverMatches: async () => {},
  },
});

const BOOKING = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
let bookingRow: { id: string } | null = { id: BOOKING };
let rpcError: { message: string } | null = null;
const rpcCalls: Record<string, unknown>[] = [];

function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () =>
      table === "mem_private_bookings"
        ? { data: bookingRow, error: null }
        : {
            data: { id: CHILD, name: "Kid", dob: "2018-01-01", person_id: null, account_id: "family-1", account: { user_id: "u-family" } },
            error: null,
          },
  };
  return chain;
}
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      from: query,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "parent@example.org" } }, error: null }) } },
      rpc: async (_name: string, args: Record<string, unknown>) => {
        rpcCalls.push(args);
        return rpcError ? { data: null, error: rpcError } : { data: { id: "place-1" }, error: null };
      },
    }),
  },
});

const { POST } = await import("@/app/api/admin/private-bookings/[id]/guests/route");

function call(body: unknown, id = BOOKING) {
  return POST(
    new Request("https://x/api", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
}
const valid = { participant_id: CHILD, equipment: "hire", hire_size: "UK1-UK3" };

function reset() {
  admin = { id: "staff-1", email: "staff@example.org" };
  waiverSigned = true;
  bookingRow = { id: BOOKING };
  rpcError = null;
  rpcCalls.length = 0;
  waiverEmails.length = 0;
}

test("non-admins are refused", async () => {
  reset();
  admin = null;
  assert.equal((await call(valid)).status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("adds the child on their own family account, checking the family's waiver", async () => {
  reset();
  const res = await call(valid);
  assert.equal(res.status, 201);
  assert.deepEqual(waiverEmails, ["parent@example.org"]);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].p_account_id, "family-1");
  assert.equal(rpcCalls[0].p_participant_id, CHILD);
  assert.equal(rpcCalls[0].p_is_birthday_person, false);
  assert.equal(rpcCalls[0].p_hire_size, "UK1-UK3");
});

test("no family waiver: refused and nothing written", async () => {
  reset();
  waiverSigned = false;
  const res = await call(valid);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /no signed waiver/);
  assert.equal(rpcCalls.length, 0);
});

test("not a birthday party: 404", async () => {
  reset();
  bookingRow = null;
  assert.equal((await call(valid)).status, 404);
  assert.equal(rpcCalls.length, 0);
});

test("hire without a size is refused before any read", async () => {
  reset();
  assert.equal((await call({ participant_id: CHILD, equipment: "hire" })).status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("the party's own refusals come back to staff", async () => {
  reset();
  rpcError = { message: "mem_private_already_joined" };
  const res = await call(valid);
  assert.ok(res.status >= 400 && res.status < 500, String(res.status));
});
