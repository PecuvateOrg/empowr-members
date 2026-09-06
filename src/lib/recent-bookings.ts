import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

const RECENT_BOOKING_HOURS = 72;
const LIVE_BOOKING_STATUSES = ["confirmed", "attended"] as const;

async function countsFor(
  column: "occurrence_id" | "course_run_id",
  ids: string[],
  since: string
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(column)
    .in(column, ids)
    .in("status", [...LIVE_BOOKING_STATUSES])
    .gte("created_at", since);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row[column];
    if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Number of people whose live booking rows were created in the last 72 hours.
 * Only aggregate counts leave this server-only module; no member data is
 * exposed to the public page.
 */
export async function recentBookingCounts(
  input: { occurrenceIds?: string[]; courseRunIds?: string[] },
  now = new Date()
): Promise<Map<string, number>> {
  const since = new Date(
    now.getTime() - RECENT_BOOKING_HOURS * 60 * 60 * 1000
  ).toISOString();

  const [occurrences, courseRuns] = await Promise.all([
    countsFor("occurrence_id", input.occurrenceIds ?? [], since),
    countsFor("course_run_id", input.courseRunIds ?? [], since),
  ]);
  return new Map([...occurrences, ...courseRuns]);
}
