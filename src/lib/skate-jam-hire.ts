import { z } from "zod";

export const SKATE_JAM_SIZES = [3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SkateJamSize = (typeof SKATE_JAM_SIZES)[number];
export const skateJamSizeSchema = z.union(SKATE_JAM_SIZES.map(size => z.literal(size)));
export const skateJamHireEntrySchema = z.object({
  participant_id: z.string().uuid(),
  // null explicitly means bringing own skates; omitted means not answered.
  size: skateJamSizeSchema.nullable(),
}).strict();
export type SkateJamHireEntry = z.infer<typeof skateJamHireEntrySchema>;
export type SkateJamAvailability = { size: SkateJamSize; available: number }[];

export function isSkateJam(offering: { slug?: string } | null | undefined) {
  return offering?.slug === "skate-jam";
}

export function skateJamHireError(required: boolean, participants: string[], entries: SkateJamHireEntry[]) {
  if (!required) return entries.length ? "Skate Jam hire is only available with pay-as-you-go Skate Jam bookings." : null;
  // Older baskets contain no hire request. They may still buy a place, but
  // reserve no skates. A submitted selection must cover every participant.
  if (!entries.length) return null;
  const ids = new Set(entries.map(entry => entry.participant_id));
  if (ids.size !== entries.length || entries.length !== participants.length || participants.some(id => !ids.has(id))) {
    return "Choose own skates or a free hire size for each Skate Jam participant.";
  }
  return null;
}

export function jamHireDescription(requested: boolean | null, size: number | null) {
  return requested === true ? `Free skate hire: UK ${size}` : requested === false ? "Bringing own skates" : "Skate choice not recorded — confirm with skater";
}
