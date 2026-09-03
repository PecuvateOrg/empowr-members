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

/** "19:30:00" -> "7:30pm", "19:00:00" -> "7pm".
 *
 *  A course run's time is a bare local wall clock (Postgres `time`), not an
 *  instant, so it is formatted by hand rather than through date-fns-tz —
 *  there is no date to resolve a zone against, and inventing one would
 *  reintroduce the BST shift the column type exists to avoid. Drops a zero
 *  minute the same way formatOccurrence does, so the two read alike. */
export function formatLocalTime(time: string): string {
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${display}${suffix}`
    : `${display}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** A course-run "when" line: label, plus a date range when both bounds
 *  are known, plus the weekly meeting time when that is known too —
 *  "Summer term (13 Jul – 17 Aug, 7:30–9:30pm)". Shared by the
 *  confirmation email, the ticket page and the member bookings list — all
 *  fold a booking's occurrence-or-course_run into one human "when" line the
 *  same way, and a per_run course has no occurrence to read a time from.
 *
 *  The time is optional because it is nullable in the schema (NULL = not
 *  stated), NOT because callers may skip selecting it — every call site
 *  selects both columns. A caller that quietly omitted them would drop the
 *  time from a real customer's ticket with nothing to show it had. */
export function courseRunWhen(run: {
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  starts_at_local?: string | null;
  ends_at_local?: string | null;
}): string {
  const time =
    run.starts_at_local && run.ends_at_local
      ? `${formatLocalTime(run.starts_at_local)}–${formatLocalTime(run.ends_at_local)}`
      : null;

  if (run.starts_on && run.ends_on) {
    const dates = `${formatDate(run.starts_on)} – ${formatDate(run.ends_on)}`;
    return `${run.label} (${time ? `${dates}, ${time}` : dates})`;
  }
  return time ? `${run.label} (${time})` : run.label;
}
