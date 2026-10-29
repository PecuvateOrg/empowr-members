import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { skateJamSizeSchema, type SkateJamAvailability } from "@/lib/skate-jam-hire";

export async function readSkateJamAvailability(occurrenceId: string): Promise<SkateJamAvailability | null> {
  try {
  const { data, error } = await createServiceClient().rpc("mem_skate_jam_hire_availability", { p_occurrence_id: occurrenceId });
  if (error || !Array.isArray(data) || data.length !== 8) return null;
  const rows: SkateJamAvailability = [];
  for (const row of data) {
    const size = skateJamSizeSchema.safeParse(row.size);
    if (!size.success || !Number.isInteger(row.available) || row.available < 0) return null;
    rows.push({ size: size.data, available: row.available });
  }
  return new Set(rows.map(row => row.size)).size === 8 ? rows : null;
  } catch {
    return null;
  }
}
