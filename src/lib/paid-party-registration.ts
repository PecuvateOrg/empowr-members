import { z } from "zod";
export const paidPartySchema = z.object({
  request_id: z.string().uuid(),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  starts_at: z.string().datetime({ offset: true }),
  paid_places: z.number().int().min(1).max(200),
  note: z.string().trim().max(1000).optional(),
  paid_confirmed: z.literal(true),
});
export const paidPartyToken = z.string().regex(/^[0-9a-f]{64}$/);
export function paidPartyError(message: string): string | null {
  return ({
    mem_paid_party_forbidden: "Use the verified email address you gave Empowr for this party. Contact the team if it needs changing.",
    mem_paid_party_missing: "This registration link could not be found.",
    mem_paid_party_closed: "This party is no longer open for setup. Please contact Empowr.",
  } as Record<string, string>)[message] ?? null;
}
