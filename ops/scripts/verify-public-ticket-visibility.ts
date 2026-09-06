import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) =>
  readFileSync(path.join(ROOT, relativePath), "utf8");

test("public and member booking views do not reveal ticket totals", () => {
  const files = [
    "src/components/catalogue/OccurrenceDates.tsx",
    "src/components/booking/BookingForm.tsx",
    "src/app/(public)/sessions/[slug]/page.tsx",
    "src/app/(member)/book/[occurrenceId]/page.tsx",
  ].map(read).join("\n");

  assert.doesNotMatch(files, /<span[^>]*>\s*\{earlyBird\.remaining\}/);
  assert.doesNotMatch(files, /\{left\} \{left === 1 \? "place" : "places"\} left/);
});

test("booked sessions show only the count created in the rolling 72-hour window", () => {
  const dates = read("src/components/catalogue/OccurrenceDates.tsx");
  assert.match(dates, /recentBookings <= 0/);
  assert.match(
    dates,
    /recentBookings === 1 \? "person" : "people".*last 72 hours/s
  );
  assert.match(dates, /Fully booked/);
});

test("recent booking aggregation is server-only and excludes unfinished holds", () => {
  const recent = read("src/lib/recent-bookings.ts");
  assert.match(recent, /import "server-only"/);
  assert.match(recent, /RECENT_BOOKING_HOURS = 72/);
  assert.match(recent, /\["confirmed", "attended"\]/);
  assert.doesNotMatch(recent, /pending_payment/);
});
