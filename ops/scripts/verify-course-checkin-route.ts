import { test, mock } from "node:test";
import assert from "node:assert/strict";

let authorised = true;
let signed = true;
let course = true;
let rpcError: { message: string; code: string } | null = null;
let flipped = true;
let calls = 0;
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
    getAuthedCheckinStaff: async () => (authorised ? { id: "staff-id" } : null),
  },
});
mock.module("@/lib/admin-data", {
  namedExports: {
    getBookingForCheckin: async () => ({
      isCourseRun: course,
      waiverSigned: signed,
    }),
  },
});
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      rpc: async (name: string, args: unknown) => {
        calls++;
        assert.equal(name, "mem_check_in_course_booking");
        assert.deepEqual(args, {
          p_booking_id: "booking-id",
          p_session_date: "2026-09-15",
          p_checked_in_by: "staff-id",
        });
        return { data: flipped, error: rpcError };
      },
    }),
  },
});
const { POST } =
  await import("@/app/api/admin/bookings/[id]/course-checkin/route");
async function checkin(body: unknown = { session_date: "2026-09-15" }) {
  return POST(
    new Request("https://example.test/checkin", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "booking-id" }) },
  );
}
function reset() {
  authorised = true;
  signed = true;
  course = true;
  rpcError = null;
  flipped = true;
  calls = 0;
}
test("unauthorised staff and unsigned waivers cannot write attendance", async () => {
  reset();
  authorised = false;
  assert.equal((await checkin()).status, 401);
  assert.equal(calls, 0);
  reset();
  signed = false;
  assert.equal((await checkin()).status, 409);
  assert.equal(calls, 0);
  reset();
  course = false;
  assert.equal((await checkin()).status, 409);
  assert.equal(calls, 0);
});
test("invalid request bodies never reach the database", async () => {
  for (const body of [
    null,
    {},
    { session_date: 123 },
    { session_date: "Tuesday" },
    { session_date: "2026-02-30" },
    { session_date: "2026-99-99" },
  ]) {
    reset();
    assert.equal((await checkin(body)).status, 400);
    assert.equal(calls, 0);
  }
});
test("saves the selected week and reports repeat taps as successful", async () => {
  reset();
  assert.deepEqual(await (await checkin()).json(), {
    ok: true,
    rowFlipped: true,
    alreadyAttended: false,
  });
  flipped = false;
  assert.deepEqual(await (await checkin()).json(), {
    ok: true,
    rowFlipped: false,
    alreadyAttended: true,
  });
});
test("database refusals and outages do not show a successful check-in", async () => {
  reset();
  rpcError = { message: "mem_course_checkin_invalid", code: "P0001" };
  assert.equal((await checkin()).status, 409);
  rpcError = { message: "unavailable", code: "08006" };
  assert.equal((await checkin()).status, 500);
});
