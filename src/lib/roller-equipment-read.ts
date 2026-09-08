import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { rollerEquipmentSchema, type RollerEquipment } from "@/lib/roller-equipment";

// Separate from the safety/register read: an equipment outage must not hide
// medical notes, emergency contacts or check-in controls. Call only after
// the existing admin/door authorization, scoped to that register's bookings.
export async function readRollerEquipment(service: ReturnType<typeof createServiceClient>, bookingIds: string[]) {
  const byBooking = new Map<string, RollerEquipment>();
  if (!bookingIds.length) return { byBooking, unavailable: false };
  try {
    const { data, error } = await service.from("mem_bookings")
      .select("id, skate_choice, hire_skate_size, protective_gear")
      .in("id", bookingIds);
    if (error) throw error;
    for (const row of data ?? []) {
      const parsed = rollerEquipmentSchema.safeParse({ skate_choice: row.skate_choice, hire_skate_size: row.hire_skate_size, protective_gear: row.protective_gear });
      if (parsed.success) byBooking.set(row.id, parsed.data);
    }
    return { byBooking, unavailable: false };
  } catch {
    console.error("Camp equipment read unavailable");
    return { byBooking, unavailable: true };
  }
}
