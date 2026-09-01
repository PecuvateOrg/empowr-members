// Membership plans (Phase 2). A "plan" here is a Subscription to ONE session
// — Skate Jam £25/mo, Sk8 Skool Kidz £30/mo, Sk8 Skool All Ages £40/mo,
// SYNKRON8 £45/mo — not a sitewide membership. The free "Empowr Member"
// account is a different concept entirely and has no row in these tables.
// Courses and Camps deliberately have no Subscription option.
//
// Source of truth for what exists and what it costs is the KB at
// vaults/EMPOWR CIC/entities/sessions.md. Anything here that diverges from it
// is a defect to correct toward the KB.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePriceIdByLookupKey } from "@/lib/stripe";
import { slotCoversOccurrence, type EntitledSlot } from "@/lib/slot-matching";
import { ageEligibleForPlan, type OfferingAgeBounds } from "@/lib/age";
import type { MembershipPlan, Membership } from "@/lib/types";

export type { EntitledSlot };

/** A plan plus the slots it entitles. A Subscription is to ONE WEEKLY SLOT —
 *  a specific day and time — not to a whole offering (Empowr, 2026-08-26).
 *  Sk8 Skool for Kidz is £30 per slot, so a child attending both Monday and
 *  Wednesday needs two Subscriptions. Matching lives in the pure, testable
 *  lib/slot-matching.ts because of the BST trap documented there. */
export type PlanWithEntitlements = MembershipPlan & {
  slots: EntitledSlot[];
};

type EntitlementRow = {
  offering_id: string | null;
  weekday: number | null;
  starts_at_local: string | null;
};

export async function listActivePlans(): Promise<PlanWithEntitlements[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_membership_plans")
    .select("*, mem_plan_entitlements(offering_id, weekday, starts_at_local)")
    .eq("active", true)
    .order("price_pence");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { mem_plan_entitlements: entitlements, ...plan } = row as MembershipPlan & {
      mem_plan_entitlements: EntitlementRow[];
    };
    return {
      ...plan,
      slots: (entitlements ?? [])
        .filter((e): e is EntitlementRow & { offering_id: string } => e.offering_id !== null)
        .map((e) => ({
          offering_id: e.offering_id,
          weekday: e.weekday,
          starts_at_local: e.starts_at_local,
        })),
    };
  });
}

/** Every active plan that entitles this OFFERING, in price order.
 *
 *  Used by the public session page to offer subscribing alongside paying per
 *  session — the decision belongs where someone is already looking at the
 *  session, not on a separate price list. An offering can have more than one
 *  (Sk8 Skool for Kidz is a plan per weekday), so this returns a list and the
 *  caller renders one card each. Courses return none: they have no
 *  Subscription option by design (Q1). */
export async function plansForOffering(
  offeringId: string
): Promise<PlanWithEntitlements[]> {
  const plans = await listActivePlans();
  return plans.filter((p) => p.slots.some((s) => s.offering_id === offeringId));
}

/** Every active plan whose slots include this occurrence. Usually zero or
 *  one; an offering with two slots (Kidz) yields one per matching day. */
export async function plansForOccurrence(occurrence: {
  offering_id: string;
  starts_at: string;
}): Promise<PlanWithEntitlements[]> {
  const plans = await listActivePlans();
  return plans.filter((p) => p.slots.some((s) => slotCoversOccurrence(s, occurrence)));
}

/**
 * Resolve the Stripe Price for a plan, in whichever mode this app's key is in.
 *
 * Throws rather than returning null on a missing Price: a plan marked active
 * with no resolvable Price is a configuration error that must not degrade into
 * a silent "no subscription available" on the page. The lookup key exists in
 * the database precisely so this can be diagnosed from the message.
 */
export async function stripePriceIdForPlan(plan: MembershipPlan): Promise<string> {
  if (!plan.stripe_lookup_key) {
    throw new Error(
      `Membership plan "${plan.name}" (${plan.id}) is active but has no stripe_lookup_key`
    );
  }
  const priceId = await resolvePriceIdByLookupKey(plan.stripe_lookup_key);
  if (!priceId) {
    throw new Error(
      `No active Stripe Price found for lookup_key "${plan.stripe_lookup_key}" ` +
        `(plan "${plan.name}"). The Price must exist in BOTH test and live mode.`
    );
  }
  return priceId;
}

// Re-exported so callers get the pair from one place; both live in lib/age.ts
// because they are pure and must stay testable outside Next.
export { ageEligibleForPlan };
export type { OfferingAgeBounds };

/**
 * Age bounds of every offering a plan entitles.
 *
 * A Subscription is bought once and then simply runs, so unlike a booking
 * there is no occurrence date to judge against — eligibility is evaluated on
 * the day someone subscribes. That leaves one known edge: a child can age out
 * of an upper bound mid-subscription. The door still catches it, because the
 * register and the walk-in path both re-check against the occurrence date.
 */
export async function planAgeBounds(
  plan: PlanWithEntitlements
): Promise<OfferingAgeBounds[]> {
  const offeringIds = [...new Set(plan.slots.map((s) => s.offering_id))];
  if (offeringIds.length === 0) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_offerings")
    .select("age_min, age_max")
    .in("id", offeringIds);
  if (error) throw error;
  return (data ?? []) as OfferingAgeBounds[];
}

/** A membership only entitles anything while it is genuinely active. A
 *  past_due subscription pauses entitlements — the member reverts to paying
 *  per session until the card is fixed — rather than being cancelled. */
export function entitlesBooking(membership: Pick<Membership, "status">): boolean {
  return membership.status === "active";
}

export async function activeMembershipsForAccount(
  accountId: string
): Promise<Membership[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_memberships")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Membership[];
}

/** One participant's active Subscription cover for a specific occurrence. */
export type OccurrenceCover = {
  participant_id: string;
  account_id: string;
  plan_id: string;
  plan_name: string;
};

/**
 * Who already holds an active Subscription entitling them to this occurrence.
 *
 * THE ONE PLACE that question is answered. Two surfaces need it and they must
 * never disagree: the register lists subscribers at the door (they hold no
 * booking row, Q5), and the booking routes refuse to charge someone for a
 * place they already pay for monthly. If those two reads drifted, a subscriber
 * could be charged twice AND appear twice at check-in — so this is a shared
 * function for the same reason checkWaivers() is, not a convenience.
 *
 * Only `active` covers. A past_due subscription pauses entitlements — the
 * member reverts to paying per session until the card is fixed — so they
 * SHOULD be able to book and pay, and should not be listed at the door.
 *
 * Throws on a read failure rather than returning []. An empty result means
 * "nobody is covered", which on the booking side would silently reopen the
 * double-charge this exists to prevent. Callers that must degrade rather than
 * break (the register) catch it themselves and say so.
 */
export async function coverForOccurrence(
  occurrence: { offering_id: string; starts_at: string },
  filter: { participantIds?: string[] } = {}
): Promise<OccurrenceCover[]> {
  if (filter.participantIds && filter.participantIds.length === 0) return [];

  const plans = await plansForOccurrence(occurrence);
  if (plans.length === 0) return [];
  const planNames = new Map(plans.map((p) => [p.id, p.name]));

  const service = createServiceClient();
  let query = service
    .from("mem_memberships")
    .select("participant_id, account_id, plan_id")
    .in("plan_id", [...planNames.keys()])
    .eq("status", "active")
    .not("participant_id", "is", null);
  if (filter.participantIds) {
    query = query.in("participant_id", filter.participantIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    participant_id: row.participant_id as string,
    account_id: row.account_id as string,
    plan_id: row.plan_id as string,
    plan_name: planNames.get(row.plan_id as string) ?? "Subscription",
  }));
}
