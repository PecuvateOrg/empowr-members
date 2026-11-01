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

// Pay-as-you-go sessions with free hire, one stock pool per date. Courses
// offer it per run instead (mem_course_runs.free_skate_hire), one size for
// the whole run. Same rule as mem_skate_hire_eligible() in the database.
const OCCURRENCE_HIRE_SLUGS = new Set(["skate-jam", "synkron8"]);
export function offersOccurrenceHire(offering: { slug?: string } | null | undefined) {
  return OCCURRENCE_HIRE_SLUGS.has(offering?.slug ?? "");
}

export function skateJamHireError(required: boolean, participants: string[], entries: SkateJamHireEntry[]) {
  if (!required) return entries.length ? "Free skate hire is not available for this booking." : null;
  // Older baskets contain no hire request. They may still buy a place, but
  // reserve no skates. A submitted selection must cover every participant.
  if (!entries.length) return null;
  const ids = new Set(entries.map(entry => entry.participant_id));
  if (ids.size !== entries.length || entries.length !== participants.length || participants.some(id => !ids.has(id))) {
    return "Choose own skates or a free hire size for each participant.";
  }
  return null;
}

export function jamHireDescription(requested: boolean | null, size: number | null) {
  return requested === true ? `Free skate hire: UK ${size}` : requested === false ? "Bringing own skates" : "Skate choice not recorded — confirm with skater";
}
