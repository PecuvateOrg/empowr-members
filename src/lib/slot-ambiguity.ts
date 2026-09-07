// Watches for the day a plan's "every slot of this offering" entitlement
// quietly stops meaning what the plan's name says.
//
// THE SHAPE OF THE PROBLEM. mem_plan_entitlements.weekday/starts_at_local may
// both be NULL, which slotCoversOccurrence() treats as "every occurrence of
// this offering". That is deliberate and correct while an offering runs ONCE
// a week: it keeps subscribers entitled through a time change, which an
// explicit slot would silently revoke — reconcileMemberBookings() would find
// their occurrences no longer entitled, CANCEL their £0 bookings and create
// nothing, at 03:15 UTC, to people who are paying.
//
// So the wildcard is a BET that the offering runs once a week. Verified on
// 2026-09-07: three of five plans hold that bet — "SYNKRON8 — Mondays",
// "Skate Jam — Thursdays" and "Sk8 Skool for All Ages — Saturdays" each carry
// a NULL slot while their NAME promises one specific day. All three were
// correct, because each offering ran exactly one weekly slot. Sk8 Skool for
// Kidz is the counter-example that proves the other shape exists: it runs
// Mondays 16:00 and Wednesdays 17:00, so its two plans carry explicit slots
// and a Monday subscriber is correctly refused the Wednesday.
//
// WHAT WENT UNWATCHED. Nothing detected the moment that bet breaks. Add a
// second SYNKRON8 night and every SYNKRON8 subscriber is entitled to it free,
// the nightly sweep materialises £0 bookings into it, those bookings take
// places against the new session and show as entitled on the register — and
// no alert fires, because the subscription alert only fires on `created`.
//
// DELIBERATELY DETECTS, NEVER FIXES. The remedy is a business decision — is
// the new night included in the existing price, or its own plan? — and
// writing an explicit slot automatically would trigger exactly the silent
// revocation described above. This module reports; a human decides.
//
// ⚠️ NO `import "server-only"`. This runs inside the nightly Netlify
// function, which is an esbuild bundle where that module throws on import.
// The Supabase client is injected for the same reason. See
// lib/materialize-member-bookings.ts and ops/scripts/verify-scheduled-function.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { localSlotOf } from "@/lib/slot-matching";
import { describeDayTime } from "@/lib/slot-describe";

/** A plan entitlement carrying no weekday/time — i.e. "every slot". */
export type WildcardEntitlement = {
  planId: string;
  planName: string;
  offeringId: string;
  offeringTitle: string;
  /** Memberships currently drawing on this plan. 0 still matters — the plan
   *  is on sale, so the next person to subscribe inherits the problem. */
  activeSubscribers: number;
};

export type OccurrenceLike = { offering_id: string; starts_at: string };

export type SlotAmbiguity = {
  planId: string;
  planName: string;
  offeringTitle: string;
  activeSubscribers: number;
  /** Every distinct weekly slot the offering now runs, in day/time order,
   *  e.g. ["Mondays 8:30pm", "Thursdays 7pm"]. Always length >= 2. */
  slots: string[];
};

/**
 * Pure core: which wildcard entitlements now cover more than one weekly slot?
 *
 * Slots are compared in Europe/London via localSlotOf() rather than on the
 * raw timestamp — the same trap lib/slot-matching.ts exists for. Comparing
 * UTC would split one weekly slot into two across the BST boundary and report
 * every offering as ambiguous every autumn.
 */
export function findSlotAmbiguities(
  wildcards: WildcardEntitlement[],
  occurrences: OccurrenceLike[]
): SlotAmbiguity[] {
  const slotsByOffering = new Map<
    string,
    Map<string, { weekday: number; time: string }>
  >();
  for (const occurrence of occurrences) {
    const slot = localSlotOf(occurrence.starts_at);
    const key = `${slot.weekday} ${slot.time}`;
    const slots =
      slotsByOffering.get(occurrence.offering_id) ??
      new Map<string, { weekday: number; time: string }>();
    slots.set(key, slot);
    slotsByOffering.set(occurrence.offering_id, slots);
  }

  const findings: SlotAmbiguity[] = [];
  for (const wildcard of wildcards) {
    const slots = [
      ...(slotsByOffering.get(wildcard.offeringId)?.values() ?? []),
    ];
    if (slots.length < 2) continue;
    slots.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
    findings.push({
      planId: wildcard.planId,
      planName: wildcard.planName,
      offeringTitle: wildcard.offeringTitle,
      activeSubscribers: wildcard.activeSubscribers,
      slots: slots.map((slot) => describeDayTime(slot.weekday, slot.time)),
    });
  }
  return findings;
}

/**
 * Read the current state and run the check. Only ACTIVE plans are considered
 * — the same filter reconcileMemberBookings() applies, so this cannot report
 * a plan that entitles nobody.
 */
export async function findActiveSlotAmbiguities(
  service: SupabaseClient
): Promise<SlotAmbiguity[]> {
  const { data: entitlements, error: entitlementsError } = await service
    .from("mem_plan_entitlements")
    .select(
      "plan_id, offering_id, plan:mem_membership_plans!inner(name, active), offering:mem_offerings(title)"
    )
    .is("weekday", null)
    .not("offering_id", "is", null);
  if (entitlementsError) throw entitlementsError;

  const one = <T>(value: T | T[] | null | undefined): T | null =>
    Array.isArray(value) ? value[0] ?? null : value ?? null;

  const rows = (entitlements ?? []) as unknown as {
    plan_id: string;
    offering_id: string;
    plan: { name: string; active: boolean } | { name: string; active: boolean }[];
    offering: { title: string } | { title: string }[] | null;
  }[];

  const active = rows.filter((row) => one(row.plan)?.active === true);
  if (active.length === 0) return [];

  // Subscriber counts per plan, so the alert can say who is affected rather
  // than only what is misconfigured.
  const { data: memberships, error: membershipsError } = await service
    .from("mem_memberships")
    .select("plan_id")
    .in("status", ["active", "past_due"]);
  if (membershipsError) throw membershipsError;
  const subscribersByPlan = new Map<string, number>();
  for (const membership of memberships ?? []) {
    const planId = membership.plan_id as string;
    subscribersByPlan.set(planId, (subscribersByPlan.get(planId) ?? 0) + 1);
  }

  const offeringIds = [...new Set(active.map((row) => row.offering_id))];
  const { data: occurrences, error: occurrencesError } = await service
    .from("mem_occurrences")
    .select("offering_id, starts_at")
    .in("offering_id", offeringIds)
    .eq("status", "scheduled")
    .gt("starts_at", new Date().toISOString());
  if (occurrencesError) throw occurrencesError;

  return findSlotAmbiguities(
    active.map((row) => ({
      planId: row.plan_id,
      planName: one(row.plan)?.name ?? "(unnamed plan)",
      offeringId: row.offering_id,
      offeringTitle: one(row.offering)?.title ?? "(unknown offering)",
      activeSubscribers: subscribersByPlan.get(row.plan_id) ?? 0,
    })),
    (occurrences ?? []) as OccurrenceLike[]
  );
}
