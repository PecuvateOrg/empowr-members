import { z } from "zod";

export const HIRE_SKATE_SIZES = ["C10 – UK 1", "UK 1 – UK 3", "UK 4 – UK 7"] as const;
export const EQUIPMENT_NOTICE = "Quad skates only. Inline skates are not permitted.";
export const PROTECTIVE_GEAR_NOTICE = "All children are required to wear full protective gear, including a helmet.";

// Standard online camp bookings; external HAF and door/subscription flows
// never use this gate. Support the catalogue's existing Quad Camp name.
export function isRollerCamp(offering: { type?: string; slug?: string; title?: string } | null | undefined) {
  if (offering?.type !== "camp") return false;
  return ["roller-quad-camp", "roller-squad-camp"].includes(offering.slug ?? "") ||
    ["roller quad camp", "roller squad camp"].includes(offering.title?.trim().toLowerCase() ?? "");
}

export const rollerEquipmentSchema = z.discriminatedUnion("skate_choice", [
  z.object({
    skate_choice: z.literal("hire"),
    hire_skate_size: z.enum(HIRE_SKATE_SIZES),
    protective_gear: z.literal("provided"),
  }).strict(),
  z.object({
    skate_choice: z.literal("own"),
    hire_skate_size: z.null(),
    protective_gear: z.enum(["own", "borrow"]),
  }).strict(),
]);
export type RollerEquipment = z.infer<typeof rollerEquipmentSchema>;
export const rollerEquipmentEntrySchema = z.object({
  participant_id: z.string().uuid(),
  equipment: rollerEquipmentSchema,
}).strict();
export type RollerEquipmentEntry = z.infer<typeof rollerEquipmentEntrySchema>;

export function equipmentSelectionError(required: boolean, participantIds: string[], entries: RollerEquipmentEntry[]): string | null {
  if (!required) return entries.length ? "Skate choices are only available for standard Roller Squad Camp bookings." : null;
  const ids = new Set(entries.map(e => e.participant_id));
  if (ids.size !== entries.length || entries.length !== participantIds.length || participantIds.some(id => !ids.has(id))) {
    return "Choose skates and protective gear for each child before continuing to payment.";
  }
  return null;
}

export function equipmentDescription(equipment: RollerEquipment | null | undefined): string {
  if (!equipment) return "Equipment choice not recorded — confirm with parent/guardian";
  if (equipment.skate_choice === "hire") return `Hire skates: ${equipment.hire_skate_size}; full protective gear and helmet included`;
  return equipment.protective_gear === "borrow"
    ? "Own quad skates; borrow full protective gear and helmet"
    : "Own quad skates; bringing own full protective gear and helmet";
}

export type EquipmentBooking = {
  id: string;
  status: string;
  source: string;
  equipment?: RollerEquipment | null;
};

export function summariseEquipment<T extends EquipmentBooking>(bookings: T[]) {
  const rows = bookings.filter(b => b.source === "online" && ["confirmed", "attended"].includes(b.status));
  const sizes = HIRE_SKATE_SIZES.map(size => ({ size, pairs: rows.filter(b => b.equipment?.hire_skate_size === size).length }));
  const hire = sizes.reduce((sum, size) => sum + size.pairs, 0);
  const borrow = rows.filter(b => b.equipment?.protective_gear === "borrow").length;
  return { rows, sizes, hire, borrow, gear: hire + borrow, missing: rows.filter(b => !b.equipment).length };
}
