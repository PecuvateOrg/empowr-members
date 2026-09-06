/** Places remaining at or below which the exact number is shown again. Kept
 *  above a typical household booking: a parent booking for several children
 *  has to learn they do not all fit before checkout, not during it. */
export const LOW_AVAILABILITY_THRESHOLD = 5;

export type AvailabilityNotice =
  | { kind: "full" }
  | { kind: "low"; left: number }
  | { kind: "recent"; count: number }
  | null;

/**
 * Decides what a public session date or course run says about availability.
 * Split out from the component so the rules can be tested as rules.
 */
export function availabilityNotice(input: {
  /** null = unlimited capacity. */
  capacity: number | null;
  booked: number;
  recentBookings: number;
}): AvailabilityNotice {
  const left = input.capacity === null ? null : input.capacity - input.booked;

  if (left !== null && left <= 0) return { kind: "full" };
  if (left !== null && left <= LOW_AVAILABILITY_THRESHOLD) {
    return { kind: "low", left };
  }
  if (input.recentBookings > 0) {
    return { kind: "recent", count: input.recentBookings };
  }
  return null;
}
