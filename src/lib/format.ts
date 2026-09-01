// Display formatting — prices in pence, occurrence times always shown
// in Europe/London wall-clock regardless of server timezone.
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";

/** 700 -> "£7", 1250 -> "£12.50" */
export function formatPrice(pence: number): string {
  const pounds = pence / 100;
  return Number.isInteger(pounds)
    ? `£${pounds}`
    : `£${pounds.toFixed(2)}`;
}

/** "Mon 13 Jul, 4:00–5:00pm" */
export function formatOccurrence(startsAt: string, endsAt: string): string {
  // The year is included deliberately. Without it a catalogue that pages into
  // next year renders "Mon 4 Jan" with nothing to say WHICH January — Sk8
  // Skool for Kidz has 57 scheduled dates and runs well past the new year.
  // The same ambiguity reaches a confirmation email or a ticket issued in
  // December for a January session, so it is fixed here in the one shared
  // formatter rather than only in the list that exposed it. Course runs have
  // always shown the year via formatDate(); this makes the two agree.
  const day = formatInTimeZone(startsAt, TIMEZONE, "EEE d MMM yyyy");
  const start = formatInTimeZone(startsAt, TIMEZONE, "h:mmaaa").replace(":00", "");
  const end = formatInTimeZone(endsAt, TIMEZONE, "h:mmaaa").replace(":00", "");
  return `${day}, ${start}–${end}`;
}

/** "13 Jul 2026" */
export function formatDate(date: string): string {
  return formatInTimeZone(date, TIMEZONE, "d MMM yyyy");
}

/** (5, 12) -> "Ages 5–12"; (15, null) -> "Ages 15+"; (null, null) -> "All ages" */
export function formatAgeRange(
  ageMin: number | null,
  ageMax: number | null
): string {
  if (ageMin === null && ageMax === null) return "All ages";
  if (ageMax === null) return `Ages ${ageMin}+`;
  if (ageMin === null) return `Up to age ${ageMax}`;
  return `Ages ${ageMin}–${ageMax}`;
}

/** A course-run "when" line: label, plus a date range when both bounds
 *  are known — "Summer term (13 Jul – 17 Aug)". Shared by the
 *  confirmation email and the ticket page — both fold a booking's
 *  occurrence-or-course_run into one human "when" line the same way. */
export function courseRunWhen(run: {
  label: string;
  starts_on: string | null;
  ends_on: string | null;
}): string {
  if (run.starts_on && run.ends_on) {
    return `${run.label} (${formatDate(run.starts_on)} – ${formatDate(run.ends_on)})`;
  }
  return run.label;
}
