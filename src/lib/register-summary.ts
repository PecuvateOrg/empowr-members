/**
 * Headcount arithmetic for the door register.
 *
 * Extracted from the register page so it can be tested, which it has to be:
 * there are currently no bookings on any occurrence, so the over-capacity
 * branch cannot fire against real rows and rendering the page would prove only
 * that the happy path renders.
 *
 * Two different numbers are true at once, and the gap between them is the
 * whole point:
 *
 *   expected     everyone who will walk through the door
 *   systemCount  what mem_hold_bookings() believes is taken
 *
 * They differ because a Subscription reserves a place with NO booking row
 * (Q5, Empowr 2026-08-31) and that function counts only booking rows. Staff
 * need `expected`; `systemCount` is what explains why nothing stopped it.
 */

export type RegisterCounts = {
  /** status = 'confirmed' */
  confirmed: number;
  /** status = 'attended' — already checked in */
  attended: number;
  /** status = 'pending_payment' — a hold still occupies a place */
  pending: number;
  /** entitled subscribers holding no booking row */
  subscribers: number;
  /** occurrence capacity, else venue default, else null for unlimited */
  capacity: number | null;
};

export type RegisterSummary = {
  expected: number;
  systemCount: number;
  capacity: number | null;
  overCapacity: boolean;
  /** Places the booking system would still sell. null when unlimited. */
  stillSellable: number | null;
};

export function summariseRegister({
  confirmed,
  attended,
  pending,
  subscribers,
  capacity,
}: RegisterCounts): RegisterSummary {
  const expected = confirmed + attended + pending + subscribers;

  // Mirrors mem_hold_bookings(): status in ('pending_payment','confirmed').
  // `attended` is deliberately absent because the RPC omits it too — so as
  // staff check people in this number falls and the session appears to regain
  // space it does not have. That is a real second gap, not a rounding
  // artefact, and it is why stillSellable can grow during a session.
  const systemCount = confirmed + pending;

  return {
    expected,
    systemCount,
    capacity,
    overCapacity: capacity !== null && expected > capacity,
    stillSellable: capacity === null ? null : Math.max(0, capacity - systemCount),
  };
}
