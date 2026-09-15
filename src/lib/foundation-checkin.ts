import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getCourseRunRegister } from "@/lib/admin-data";
import { foundationSessionDates } from "@/lib/course-attendance";
import { londonToday } from "@/lib/catalogue-filters";

export type FoundationCheckinSession = {
  id: string;
  label: string;
  date: string;
  starts_at_local: string | null;
  ends_at_local: string | null;
};

export async function listFoundationCheckinSessions(): Promise<
  FoundationCheckinSession[]
> {
  const today = londonToday();
  const tomorrowDate = new Date(`${today}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const { data, error } = await createServiceClient()
    .from("mem_course_runs")
    .select(
      "id, label, starts_on, ends_on, starts_at_local, ends_at_local, offering:mem_offerings!inner(slug)",
    )
    .eq("offering.slug", "beginners-foundation")
    .lte("starts_on", tomorrow)
    .gte("ends_on", today)
    .order("starts_on");
  if (error) throw new Error("Could not load Beginners Foundation sessions.");
  const runs = (data ?? []) as unknown as (Omit<
    FoundationCheckinSession,
    "date"
  > & { starts_on: string; ends_on: string })[];
  return runs.flatMap((run) =>
    foundationSessionDates(run)
      .filter((date) => date === today || date === tomorrow)
      .map((date) => ({
        id: run.id,
        label: run.label,
        date,
        starts_at_local: run.starts_at_local,
        ends_at_local: run.ends_at_local,
      })),
  );
}

export async function getFoundationCheckinRegister(
  runId: string,
  date: string,
) {
  const run = await getCourseRunRegister(runId, date);
  if (
    !run ||
    run.offeringSlug !== "beginners-foundation" ||
    !foundationSessionDates(run).includes(date)
  )
    return null;
  const { data, error } = await createServiceClient()
    .from("mem_course_attendance")
    .select("booking_id")
    .eq("session_date", date)
    .in(
      "booking_id",
      run.bookings.map((booking) => booking.id),
    );
  if (error)
    throw new Error("Could not load course attendance. Please try again.");
  return {
    run,
    date,
    checkedIn: new Set((data ?? []).map((row) => row.booking_id as string)),
  };
}
