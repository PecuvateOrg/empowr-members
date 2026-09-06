import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  LOW_AVAILABILITY_THRESHOLD,
  availabilityNotice,
} from "../../src/lib/availability-notice.ts";

const notice = (
  capacity: number | null,
  booked: number,
  recentBookings = 0
) => availabilityNotice({ capacity, booked, recentBookings });

test("a session with room to spare gives away no capacity figure", () => {
  const result = notice(30, 4, 9);
  assert.deepEqual(result, { kind: "recent", count: 9 });
});

test("the exact count returns once availability is genuinely tight", () => {
  assert.deepEqual(notice(30, 25), {
    kind: "low",
    left: LOW_AVAILABILITY_THRESHOLD,
  });
  assert.deepEqual(notice(30, 29), { kind: "low", left: 1 });
});

// The reason the threshold exists: a parent booking three children must find
// out before checkout that they do not all fit.
test("a household-sized shortfall is always stated as a number", () => {
  const result = notice(30, 28);
  assert.equal(result?.kind, "low");
  assert.ok(result.kind === "low" && result.left < 3);
});

test("a low count outranks recent demand", () => {
  assert.deepEqual(notice(30, 27, 12), { kind: "low", left: 3 });
});

test("a full session says so rather than showing zero places", () => {
  assert.deepEqual(notice(30, 30, 5), { kind: "full" });
  assert.deepEqual(notice(30, 31), { kind: "full" });
});

test("an uncapped session never claims a bound it does not have", () => {
  assert.deepEqual(notice(null, 400, 6), { kind: "recent", count: 6 });
  assert.equal(notice(null, 400, 0), null);
});

test("a quiet session with room shows nothing at all", () => {
  assert.equal(notice(30, 2, 0), null);
});

test("the public components render only through the shared decision", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const dates = readFileSync(
    path.join(root, "src/components/catalogue/OccurrenceDates.tsx"),
    "utf8"
  );
  // Guards the split itself: if a component starts deriving capacity again,
  // the rules above stop describing what the public actually sees.
  assert.match(dates, /availabilityNotice\(/);
  assert.doesNotMatch(dates, /capacity\s*-\s*booked/);
});
