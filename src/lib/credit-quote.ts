// How much account credit a basket would use. Mirrors mem_reserve_credit()
// exactly, because the database refuses the checkout unless the basket sends
// the same figure (expected_credit_pence) — so the two must never drift. If
// you change one, change the other in the same PR.

/** Stripe's minimum card charge in GBP. */
export const STRIPE_MIN_CHARGE_PENCE = 30;

export function creditToApply(totalPence: number, availablePence: number): number {
  let apply = Math.min(totalPence, Math.max(0, availablePence));
  // Leave at least 30p for the card when credit cannot cover all of it.
  if (totalPence > apply && totalPence - apply < STRIPE_MIN_CHARGE_PENCE) {
    apply = Math.max(0, totalPence - STRIPE_MIN_CHARGE_PENCE);
  }
  return apply;
}
