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

  assert.doesNotMatch(files, /<span[^>]*>\\s*\\{earlyBird\\.remaining\\}/);
  assert.doesNotMatch(files, /\\{left\\} \\{left === 1 \\? "place" : "places"\\} left/);
});

test("booked sessions use truthful social proof without an exact count", () => {
  const dates = read("src/components/catalogue/OccurrenceDates.tsx");
  assert.match(dates, /booked <= 0/);
  assert.match(dates, /Someone has booked this session/);
  assert.match(dates, /Fully booked/);
});
