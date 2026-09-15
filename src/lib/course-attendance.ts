import { londonToday } from "@/lib/catalogue-filters";

export type CourseSchedule = {
  starts_on: string | null;
  ends_on: string | null;
};

export function foundationSessionDates(run: CourseSchedule): string[] {
  if (!run.starts_on || !run.ends_on) return [];
  const start = new Date(`${run.starts_on}T12:00:00Z`);
  const end = new Date(`${run.ends_on}T12:00:00Z`);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > end
  )
    return [];
  const dates: string[] = [];
  // Calendar arithmetic in UTC preserves the weekday across BST changes.
  for (
    const day = new Date(start);
    day <= end;
    day.setUTCDate(day.getUTCDate() + 7)
  ) {
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

export function canCheckInCourseDate(
  date: string,
  now: Date = new Date(),
): boolean {
  return date <= londonToday(now);
}
