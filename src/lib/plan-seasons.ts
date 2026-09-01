/**
 * Seasonal terms that must be stated before someone subscribes.
 *
 * WHY THIS IS A FILE AND NOT A COLUMN: the season boundary is not in the
 * schema. Nothing on mem_membership_plans, mem_offerings or
 * mem_plan_entitlements holds a date range — the only near-match is
 * starts_at_local, a time of day. The fact lives in the KB
 * (vaults/EMPOWR CIC/entities/sessions.md) and in Empowr's 2026/27 timeline
 * document, and the app has never known about it.
 *
 * That is also why the automatic pause (Q8) is unbuilt: you cannot schedule a
 * pause off data that does not exist. This module does NOT implement the
 * pause. It only makes sure nobody is sold a subscription without being told
 * the season stops — which mattered from the day the plans went on sale.
 *
 * THE PROPER FIX is a season on the plan row, set through the admin UI, with
 * the pause driven from it. When that lands, delete this file rather than
 * leaving both.
 *
 * COPY IS TAKEN VERBATIM from the KB's member-facing wording (sessions.md
 * § "Skate Jam out of season", confirmed by Empowr 2026-08-31). It is a
 * promise already made there, so the two must not drift: change the KB
 * first, then this, then re-run /sync-kb.
 *
 * Keyed by stripe_lookup_key because that is the plan's stable identifier
 * across test and live — the same reason the code resolves Prices by lookup
 * key rather than by Price ID.
 */

export type PlanSeason = {
  /** Short form for beside the price, e.g. "3 September – 25 March". */
  window: string;
  /** The full member-facing promise, as written in the KB. */
  detail: string;
};

const PLAN_SEASONS: Record<string, PlanSeason> = {
  members_skate_jam_monthly: {
    window: "3 September – 25 March",
    detail:
      "Skate Jam runs 3 September – 25 March only. Your subscription pauses " +
      "automatically at the end of the season and restarts when the new " +
      "season begins — no payment is taken in between, and there is nothing " +
      "to cancel or re-subscribe to.",
  },
};

/**
 * The season for a plan, or null when it runs year-round.
 *
 * Only Skate Jam is seasonal. The KB is explicit that the other four
 * Subscriptions run year-round and are unaffected, so returning null here is
 * a positive statement about them, not a gap in the table.
 */
export function seasonForPlan(
  stripeLookupKey: string | null | undefined
): PlanSeason | null {
  if (!stripeLookupKey) return null;
  return PLAN_SEASONS[stripeLookupKey] ?? null;
}
