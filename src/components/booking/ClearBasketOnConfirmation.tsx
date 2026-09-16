"use client";

import { useEffect } from "react";
import { completeBasketCheckout } from "@/lib/booking-basket";

/** Payment success is the point at which a local basket is spent. Keeping it
 * until this page means cancelling out of Stripe returns to an intact basket. */
export function ClearBasketOnConfirmation({
  accountId,
  checkoutSessionId,
}: {
  accountId: string;
  checkoutSessionId: string;
}) {
  useEffect(
    () => completeBasketCheckout(accountId, checkoutSessionId),
    [accountId, checkoutSessionId]
  );
  return null;
}
