/**
 * What a member is told about one subscription.
 *
 * Kept out of lib/membership.ts, which is `server-only`, so the rules can be
 * tested as rules rather than asserted against rendered wording.
 */
export type MembershipNotice =
  | { kind: "past_due" }
  | { kind: "ending"; on: string | null }
  | { kind: "active" };

export function membershipNotice(membership: {
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}): MembershipNotice {
  // A failed card outranks a pending cancellation: it is the one that still
  // needs the member to do something, and it can be true at the same time.
  if (membership.status === "past_due") return { kind: "past_due" };

  if (membership.cancel_at_period_end) {
    return { kind: "ending", on: membership.current_period_end };
  }
  return { kind: "active" };
}
