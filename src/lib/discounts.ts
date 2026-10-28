import { z } from "zod";

export const discountCodeSchema = z.string().trim().toUpperCase().min(3).max(40)
  .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, hyphens or underscores");

export const discountSchema = z.object({
  code: discountCodeSchema,
  kind: z.enum(["percentage", "fixed"]),
  value: z.number().int().positive().max(100000000),
  offering_id: z.string().uuid().nullable(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
}).superRefine((value, ctx) => {
  if (value.kind === "percentage" && value.value > 100) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage must be between 1 and 100" });
  }
  if (value.expires_at && Date.parse(value.expires_at) <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be in the future" });
  }
});

export type Discount = z.infer<typeof discountSchema> & {
  id: string;
  active: boolean;
  created_at: string;
};

/** Fixed discounts apply per participant-place, never to unrelated items. */
export function discountForPlace(price: number, offeringId: string, discount: Pick<Discount, "kind" | "value" | "offering_id">): number {
  if (!Number.isSafeInteger(price) || price < 0) throw new Error("Invalid price");
  if (discount.offering_id && discount.offering_id !== offeringId) return 0;
  return Math.min(price, discount.kind === "percentage"
    ? Math.floor((price * discount.value + 50) / 100)
    : discount.value);
}

export type DiscountQuote = { code: string; subtotal_pence: number; discount_pence: number; total_pence: number };
