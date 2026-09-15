import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foundationSessionDates,
  canCheckInCourseDate,
} from "../../src/lib/course-attendance.ts";

test("four course meetings include both endpoints", () => {
  assert.deepEqual(
    foundationSessionDates({ starts_on: "2026-09-15", ends_on: "2026-10-06" }),
    ["2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"],
  );
});
test("weekly dates retain their weekday over the BST change", () => {
  assert.deepEqual(
    foundationSessionDates({ starts_on: "2026-10-20", ends_on: "2026-11-10" }),
    ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"],
  );
});
test("undated or backwards courses produce no invented meetings", () => {
  assert.deepEqual(
    foundationSessionDates({ starts_on: null, ends_on: "2026-10-06" }),
    [],
  );
  assert.deepEqual(
    foundationSessionDates({ starts_on: "2026-10-06", ends_on: "2026-09-15" }),
    [],
  );
});
test("a meeting opens at London midnight and future meetings remain closed", () => {
  const midnightLondon = new Date("2026-09-14T23:30:00Z");
  assert.equal(canCheckInCourseDate("2026-09-15", midnightLondon), true);
  assert.equal(canCheckInCourseDate("2026-09-22", midnightLondon), false);
});
