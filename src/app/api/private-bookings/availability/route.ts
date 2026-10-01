// GET /api/private-bookings/availability?type=party|one|group
//
// The next open dates for one private-booking type, for EELA's "Next
// available dates" list (it replaced a hand-kept Google Calendar embed,
// owner decision 2026-09-29). Public and read-only: it says which Saturday
// intervals are free, nothing about who booked the rest, so any origin may
// read it. The dates come from the same SQL rule the hold enforces, so a
// date shown here is one the booking form will offer.
import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";
import { TYPE_PARAM } from "@/lib/private-bookings";
import { listPrivateAvailability, listPrivateTypes } from "@/lib/private-bookings-server";

export const dynamic = "force-dynamic";

const LOOKAHEAD_DAYS = 120;
const MAX_DATES = 6;

const headers = {
  "Access-Control-Allow-Origin": "*",
  // Short: a date taken a minute ago should not stay advertised for long.
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("type") ?? "";
  const kind = TYPE_PARAM[param];
  if (!kind) {
    return NextResponse.json({ error: "Unknown type" }, { status: 400, headers });
  }

  try {
    // Not open for online booking (or schema not applied): say so rather than
    // list dates nobody can book.
    const type = ((await listPrivateTypes()) ?? []).find((t) => t.kind === kind && t.active);
    if (!type) return NextResponse.json({ open: false, dates: [] }, { headers });

    const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
    const until = formatInTimeZone(
      new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000),
      TIMEZONE,
      "yyyy-MM-dd"
    );
    const slots = (await listPrivateAvailability(today, until)).filter((s) => s.kind === kind);

    // One row per Saturday, listing the times open that day. Each time carries
    // its exact start and length so EELA can hand the choice to the booking
    // form (?at=&h=, read by parsePrivateDraft) and the form opens on it.
    type Time = { label: string; starts_at: string; hours: number };
    const byDate = new Map<string, { date: string; label: string; times: Time[] }>();
    for (const s of slots) {
      const date = formatInTimeZone(s.starts_at, TIMEZONE, "yyyy-MM-dd");
      const time = `${formatInTimeZone(s.starts_at, TIMEZONE, "h")}–${formatInTimeZone(s.ends_at, TIMEZONE, "haaa")}`;
      const row = byDate.get(date) ?? {
        date,
        label: formatInTimeZone(s.starts_at, TIMEZONE, "EEE d MMM"),
        times: [],
      };
      if (!row.times.some((t) => t.label === time)) {
        row.times.push({ label: time, starts_at: s.starts_at, hours: s.hours });
      }
      byDate.set(date, row);
    }
    const dates = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_DATES);

    return NextResponse.json({ open: true, dates }, { headers });
  } catch {
    return NextResponse.json({ error: "Availability is unavailable right now" }, { status: 503, headers });
  }
}
