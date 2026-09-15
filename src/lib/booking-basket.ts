import type { BookingInput } from "@/lib/validation";

export const BOOKING_BASKET_EVENT = "empowr-booking-basket-change";
const CHECKOUT_MARKER_PREFIX = "empowr-booking-basket-checkout:";

export type BookingBasketItem = BookingInput & {
  /** Stable local identity. There is deliberately one card per target. */
  key: string;
  offeringTitle: string;
  when: string;
  venue: string | null;
  participantNames: string[];
  unitPricePence: number;
  bookingPath: string;
};

export function basketKey(accountId: string): string {
  return `empowr-booking-basket:${accountId}`;
}

export function targetKey(target: {
  occurrence_id?: string;
  course_run_id?: string;
}): string {
  return target.occurrence_id
    ? `occurrence:${target.occurrence_id}`
    : `course:${target.course_run_id}`;
}

export function basketPlaces(items: BookingBasketItem[]): number {
  return items.reduce((sum, item) => sum + item.participant_ids.length, 0);
}

export function basketTotal(items: BookingBasketItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.unitPricePence * item.participant_ids.length,
    0
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBasketItem(value: unknown): value is BookingBasketItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BookingBasketItem>;
  const hasOneTarget = Boolean(item.occurrence_id) !== Boolean(item.course_run_id);
  return (
    hasOneTarget &&
    typeof item.key === "string" &&
    typeof item.offeringTitle === "string" &&
    typeof item.when === "string" &&
    (item.venue === null || typeof item.venue === "string") &&
    isStringArray(item.participant_ids) &&
    item.participant_ids.length > 0 &&
    isStringArray(item.participantNames) &&
    item.participantNames.length === item.participant_ids.length &&
    typeof item.unitPricePence === "number" &&
    Number.isInteger(item.unitPricePence) &&
    item.unitPricePence >= 0 &&
    typeof item.bookingPath === "string" &&
    Array.isArray(item.departure_consents) &&
    Array.isArray(item.roller_equipment) &&
    typeof item.early_bird === "boolean"
  );
}

export function readBasket(accountId: string): BookingBasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(basketKey(accountId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isBasketItem) : [];
  } catch {
    return [];
  }
}

export function writeBasket(accountId: string, items: BookingBasketItem[]): void {
  localStorage.setItem(basketKey(accountId), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(BOOKING_BASKET_EVENT));
}

export function upsertBasketItem(
  accountId: string,
  item: BookingBasketItem
): BookingBasketItem[] {
  const current = readBasket(accountId);
  const index = current.findIndex((entry) => entry.key === item.key);
  const next = [...current];
  if (index === -1) next.push(item);
  else next[index] = item;
  writeBasket(accountId, next);
  return next;
}

export function clearBasket(accountId: string): void {
  writeBasket(accountId, []);
}

/** Remember exactly which local cards entered a Checkout. A separate
 * "pay now" purchase must never clear an unrelated basket, and a second tab
 * may add another card while Stripe is open. */
export function rememberBasketCheckout(
  accountId: string,
  checkoutSessionId: string,
  itemKeys: string[]
): void {
  localStorage.setItem(
    `${CHECKOUT_MARKER_PREFIX}${checkoutSessionId}`,
    JSON.stringify({ accountId, itemKeys })
  );
}

export function completeBasketCheckout(
  accountId: string,
  checkoutSessionId: string
): void {
  const markerKey = `${CHECKOUT_MARKER_PREFIX}${checkoutSessionId}`;
  try {
    const marker = JSON.parse(localStorage.getItem(markerKey) ?? "null") as {
      accountId?: unknown;
      itemKeys?: unknown;
    } | null;
    if (
      marker?.accountId !== accountId ||
      !Array.isArray(marker.itemKeys) ||
      !marker.itemKeys.every((key) => typeof key === "string")
    ) {
      return;
    }
    const spent = new Set(marker.itemKeys);
    writeBasket(
      accountId,
      readBasket(accountId).filter((item) => !spent.has(item.key))
    );
  } finally {
    localStorage.removeItem(markerKey);
  }
}

/** Display fields never cross the trust boundary. Prices, titles and target
 * bookability are all resolved again by the server at checkout. */
export function toCheckoutItem(item: BookingBasketItem): BookingInput {
  return {
    ...(item.occurrence_id ? { occurrence_id: item.occurrence_id } : {}),
    ...(item.course_run_id ? { course_run_id: item.course_run_id } : {}),
    participant_ids: item.participant_ids,
    departure_consents: item.departure_consents,
    roller_equipment: item.roller_equipment,
    early_bird: item.early_bird,
  };
}
