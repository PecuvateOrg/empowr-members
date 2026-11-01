import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { SKATE_JAM_SIZES, skateJamSizeSchema, type SkateJamAvailability } from "@/lib/skate-jam-hire";

export function readSkateJamAvailability(occurrenceId: string) {
  return readAvailability("mem_skate_jam_hire_availability", { p_occurrence_id: occurrenceId });
}

export function readRunHireAvailability(courseRunId: string) {
  return readAvailability("mem_skate_hire_run_availability", { p_course_run_id: courseRunId });
}

async function readAvailability(
  fn: "mem_skate_jam_hire_availability" | "mem_skate_hire_run_availability",
  args: { p_occurrence_id: string } | { p_course_run_id: string },
): Promise<SkateJamAvailability | null> {
  try {
  const { data, error } = await createServiceClient().rpc(fn as never, args as never);
  if (error || !Array.isArray(data) || data.length !== SKATE_JAM_SIZES.length) return null;
  const rows: SkateJamAvailability = [];
  for (const row of data) {
    const size = skateJamSizeSchema.safeParse(row.size);
    if (!size.success || !Number.isInteger(row.available) || row.available < 0) return null;
    rows.push({ size: size.data, available: row.available });
  }
  return new Set(rows.map(row => row.size)).size === SKATE_JAM_SIZES.length ? rows : null;
  } catch {
    return null;
  }
}
