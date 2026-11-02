import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";

export const privateOfferSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  paid_places: z.number().int().min(1).max(200),
});
export const offerTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const OFFER_LATE_HIRE_MESSAGE = "The skate-size deadline has passed. Please contact Empowr to arrange skate hire.";
export function offerDeadline(value: string): string {
  return formatInTimeZone(value, TIMEZONE, "EEE d MMM yyyy, h:mmaaa");
}
export function offerCheckoutExpiry(expiresAt: string, startsAt: string, now = Date.now()): number | null {
  const deadline = Math.min(Date.parse(expiresAt), Date.parse(startsAt));
  if (!Number.isFinite(deadline) || deadline - now < 31 * 60_000) return null;
  return Math.floor(Math.min(deadline, now + 31 * 60_000) / 1000);
}
export function privateOfferRefusal(message: string): string | null {
  const errors: Record<string, string> = {
    mem_private_offer_missing: "This offer could not be found.",
    mem_private_offer_expired: "This offer has expired. Please contact Empowr.",
    mem_private_offer_used: "This offer has already been booked.",
    mem_private_offer_use_public: "Use the normal booking page for dates at least two weeks ahead.",
    mem_private_offer_checkout_closed: "There is not enough time to start a new checkout. Please contact Empowr.",
  };
  return errors[message] ?? null;
}
export type PrivateOffer = {
  id: string; token: string; starts_at: string; paid_places: number; price_pence: number;
  created_at: string; expires_at: string; booking_id: string | null;
};
