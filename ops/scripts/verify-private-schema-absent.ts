/**
 * verify-private-schema-absent.ts
 *
 * Run:  npm run verify:private-schema-absent      (from src/)
 *
 * Pins how the private-bookings reads behave while the schema is NOT applied.
 *
 * WHY THIS EXISTS. `planning/architecture/private-bookings-schema.sql` is an
 * owner step, so between phase 1 shipping and that step the tables genuinely
 * do not exist. Every read of them then comes back PGRST205, and the first
 * cut of this code threw on it — which put a red error boundary on
 * /admin/private-bookings, reached from a tile on the admin dashboard, and on
 * /private-bookings for anyone who went to the URL directly. (Nothing links a
 * member there yet: `/private-bookings` is in BottomNav's BAR_PREFIXES, which
 * decides where the bar is RENDERED, not where it points.)
 *
 * The two error codes below were confirmed against the live project rather
 * than assumed (2026-09-27, `mem_private*` absent from pg_class):
 *
 *   missing TABLE    -> 404 PGRST205  "Could not find the table ... in the
 *                                      schema cache"
 *   missing FUNCTION -> 404 PGRST202  "Could not find the function ..."
 *
 * 🔑 THE POINT OF THE SUITE IS THE BOUNDARY, NOT THE CATCH. Degrading too far
 * is the more expensive mistake: PGRST205 is safe to swallow because it
 * positively identifies an absent table, but a swallowed PGRST201 (the
 * ambiguous-embed error that emptied /bookings on 2026-09-17) would render
 * "nothing booked" over a live database. So this asserts BOTH directions —
 * 205 degrades, everything else still throws.
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";

type Result = { data: unknown; error: unknown };

// What the next read returns. Set per test.
let tableResult: Result = { data: [], error: null };
let rpcResult: Result = { data: [], error: null };

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: {
    NextResponse: {
      json: (body: unknown, options?: ResponseInit) => Response.json(body, options),
    },
  },
});
// Never constructed in this suite, but the module is imported at load time.
mock.module("@/lib/stripe", {
  namedExports: {
    getStripe: () => ({}),
    getOrCreateStripeCustomer: async () => "cus_test",
    stripeCustomerAccount: () => ({}),
    HOLD_GRACE_MINUTES: 10,
  },
});

/** The two calls under test are `.from(t).select(...).order(...)` awaited, and
 *  `.rpc(fn, args)` awaited. Nothing else needs to exist. */
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      from: () => {
        const self: Record<string, unknown> = {
          select: () => self,
          order: () => self,
          then: (ok: (v: Result) => unknown, no?: (e: unknown) => unknown) =>
            Promise.resolve(tableResult).then(ok, no),
        };
        return self;
      },
      rpc: async () => rpcResult,
    }),
  },
});

const { listPrivateTypes, listPrivateAvailability } = await import(
  "@/lib/private-bookings-server"
);

const TYPE_ROW = {
  kind: "birthday",
  title: "Birthday party",
  unit_price_pence: 2000,
  min_places: 10,
  max_places: null,
  hire_price_pence: null,
  active: false,
};

// ---------------------------------------------------------------------------
// listPrivateTypes
// ---------------------------------------------------------------------------

test("types: PGRST205 degrades to null, so the pages can say 'not set up yet'", async () => {
  tableResult = {
    data: null,
    error: {
      code: "PGRST205",
      message: "Could not find the table 'public.mem_private_booking_types' in the schema cache",
    },
  };
  assert.equal(await listPrivateTypes(), null);
});

test("types: null is NOT [] — the admin screen tells them apart", async () => {
  // [] means the table exists and holds no rows: a configuration state, where
  // staff entry still works. null means the table is absent, where it cannot.
  // Collapsing 205 to [] would have offered a manual-booking form that fails.
  tableResult = { data: [], error: null };
  const empty = await listPrivateTypes();
  assert.deepEqual(empty, []);
  assert.notEqual(empty, null);
});

test("types: a successful read still returns its rows", async () => {
  tableResult = { data: [TYPE_ROW], error: null };
  assert.deepEqual(await listPrivateTypes(), [TYPE_ROW]);
});

test("types: PGRST201 (ambiguous embed) STILL THROWS — it is not an absent table", async () => {
  // This is the 2026-09-17 outage's error code. A second foreign key made an
  // embed ambiguous and /bookings rendered "No upcoming bookings yet" to
  // members who had bookings. Degrading it here would repeat that.
  tableResult = {
    data: null,
    error: { code: "PGRST201", message: "Could not embed because more than one relationship..." },
  };
  await assert.rejects(() => listPrivateTypes(), /private_types_read_failed/);
});

test("types: an error with no code at all still throws", async () => {
  tableResult = { data: null, error: { message: "fetch failed" } };
  await assert.rejects(() => listPrivateTypes(), /private_types_read_failed/);
});

// ---------------------------------------------------------------------------
// listPrivateAvailability
// ---------------------------------------------------------------------------

test("availability: PGRST202 throws, deliberately — it is unreachable before the schema exists", async () => {
  // A missing RPC is NOT degraded, and the asymmetry with the table read is
  // intentional. /private-bookings only asks for availability once it has at
  // least one active type, which cannot happen while the tables are absent.
  // So a 202 reaching here means the function is missing from a schema that
  // IS applied — a real fault, which must not render as "no Saturdays free".
  rpcResult = {
    data: null,
    error: {
      code: "PGRST202",
      message: "Could not find the function public.mem_public_private_availability",
    },
  };
  await assert.rejects(
    () => listPrivateAvailability("2026-10-01", "2026-10-08"),
    /private_availability_read_failed/
  );
});

test("availability: a successful read returns its slots", async () => {
  const slot = { slot_date: "2026-10-03", starts_at: "2026-10-03T14:00:00Z", ends_at: "2026-10-03T16:00:00Z" };
  rpcResult = { data: [slot], error: null };
  assert.deepEqual(await listPrivateAvailability("2026-10-01", "2026-10-08"), [slot]);
});
