// Phase 2 Step 4 — materialise a subscriber's reserved place as a real
// mem_bookings row (source='member', £0, confirmed).
//
// WHY THIS EXISTS: a Subscription reserves a place with NO booking action
// (Q5, Empowr 2026-08-31). coverForOccurrence() already resolves that live
// for the register and the double-charge refusal — this module does NOT
// duplicate that read. What it fixes is the two things that key off a real
// mem_bookings row and cannot be satisfied by a live read: capacity
// (mem_hold_bookings() only counts booking rows) and check-in (there is no
// control for an entry that doesn't exist).
//
// Reuses slotCoversOccurrence() rather than reimplementing slot matching in
// SQL — that function exists specifically to keep the Europe/London BST trap
// solved in exactly one place. A second, subtly different implementation in
// SQL is the same class of bug this project has shipped three times already
// (checkWaivers, coverForOccurrence).
//
// RECONCILIATION, NOT A DELTA. A participant can hold more than one
// Subscription (e.g. Kidz Monday AND Wednesday), so "cancel this
// membership's bookings" can't be computed from the membership that just
// changed — it has to be "recompute this participant's entitled occurrences
// from ALL their currently-active memberships, then create what's missing
// and cancel what's no longer covered." That is also what makes this safe to
// call repeatedly: idempotent by construction, so a Stripe webhook retry or
// a missed cron tick just re-converges instead of double-booking or racing.
//
// Deliberately does NOT check age eligibility or capacity against
// mem_hold_bookings()'s guard — Q5's answer was that a Subscription reserves
// a place unconditionally, and the register's existing "over capacity"
// banner is the accepted UI for what happens when that collides with a
// full room. This function's insert also has no capacity check for the same
// reason: the subscriber's place takes priority, and it is the PAID
// capacity check (already counting confirmed 'member' rows) that shrinks
// around them, not the other way round.
// ⚠️ DELIBERATELY NO `import "server-only"`, AND THE CLIENT IS INJECTED.
// This module is imported by BOTH the Stripe webhook (a Next.js route) and
// netlify/functions/materialize-member-bookings.ts (a plain esbuild-bundled
// Node function). `server-only` resolves via an exports map: "react-server"
// -> empty.js, "default" -> index.js, and index.js is nothing but a `throw`.
// A Netlify function bundle sets no react-server condition, so it takes the
// default and THROWS AT IMPORT — the nightly sweep would have died on its
// first line every night, in a log nobody reads, while the deploy itself
// reported success. Same reasoning that keeps lib/slot-matching.ts and
// lib/catalogue-read.ts free of the guard: a module that must run outside
// Next cannot carry it. lib/supabase/service.ts keeps its guard, which is
// exactly why the client is passed in rather than constructed here.
import type { SupabaseClient } from "@supabase/supabase-js";
import { slotCoversOccurrence, type EntitledSlot } from "@/lib/slot-matching";

type OccurrenceRow = {
  id: string;
  offering_id: string;
  starts_at: string;
};

/** A booking that occupies a place. Mirrors mem_hold_bookings()'s own
 *  definition (and lib/admin-data.ts's) — 'attended' counts, because staff
 *  check people in BEFORE a session starts and the check-in route carries no
 *  time guard. */
const LIVE_BOOKING_STATUSES = ["pending_payment", "confirmed", "attended"];

export type ReconcileResult = {
  participantId: string;
  created: number;
  cancelled: number;
};

/**
 * Sync one participant's source='member' bookings to match their currently
 * active memberships. Safe to call any number of times.
 */
export async function reconcileMemberBookings(
  service: SupabaseClient,
  participantId: string
): Promise<ReconcileResult> {
  // This participant's currently active memberships, and the slots they
  // entitle.
  const { data: memberships, error: membershipsError } = await service
    .from("mem_memberships")
    .select("account_id, plan_id, plan:mem_membership_plans!inner(active)")
    .eq("participant_id", participantId)
    .eq("status", "active");
  if (membershipsError) throw membershipsError;

  // Only ACTIVE plans entitle — same filter listActivePlans() applies, so
  // this can never disagree with coverForOccurrence() about who is covered.
  const activeMemberships = ((memberships ?? []) as unknown as {
    account_id: string;
    plan_id: string;
    plan: { active: boolean } | { active: boolean }[];
  }[]).filter((m) => {
    const plan = Array.isArray(m.plan) ? m.plan[0] : m.plan;
    return plan?.active === true;
  });

  const accountId = activeMemberships[0]?.account_id as string | undefined;

  let slots: EntitledSlot[] = [];
  const planIds = [
    ...new Set(activeMemberships.map((m) => m.plan_id)),
  ];
  if (planIds.length > 0) {
    const { data: entitlements, error: entitlementsError } = await service
      .from("mem_plan_entitlements")
      .select("plan_id, offering_id, weekday, starts_at_local")
      .in("plan_id", planIds)
      .not("offering_id", "is", null);
    if (entitlementsError) throw entitlementsError;
    slots = (entitlements ?? [])
      .filter((e) => planIds.includes(e.plan_id as string))
      .map((e) => ({
        offering_id: e.offering_id as string,
        weekday: e.weekday as number | null,
        starts_at_local: e.starts_at_local as string | null,
      }));
  }

  // EVERY live booking for this participant, whatever its source — future
  // occurrences only (past ones are attendance history and must never be
  // touched). Filtered to future in JS rather than as a cross-table filter
  // on the embedded occurrence, which is not worth relying on.
  //
  // Two DIFFERENT sets come out of this one read, and conflating them is a
  // bug in both directions:
  //
  //   occupied  — any live booking, ANY source. Nothing may be created for
  //               an occurrence already in here. It must include 'attended',
  //               because the partial unique index behind this
  //               (uniq_mem_booking_participant_occurrence) only covers
  //               pending_payment/confirmed — so an early check-in takes the
  //               row OUT of the index's reach and a second insert would
  //               succeed, duplicating the person on the register and
  //               double-counting them against capacity. It must also
  //               include 'online'/'walk_in', so a subscriber who already
  //               paid for a session never ends up holding two rows for it.
  //
  //   ownedFuture — source='member' AND status='confirmed' only. This is the
  //               ONLY set that may be cancelled. Cancelling by occurrence
  //               without these filters would cancel somebody's PAID booking
  //               when their subscription lapsed, or wipe an attendance
  //               record.
  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await service
    .from("mem_bookings")
    .select(
      "id, occurrence_id, status, source, occurrence:mem_occurrences(id, offering_id, starts_at)"
    )
    .eq("participant_id", participantId)
    .in("status", LIVE_BOOKING_STATUSES)
    .not("occurrence_id", "is", null);
  if (existingError) throw existingError;

  const liveRows = ((existing ?? []) as unknown as {
    id: string;
    occurrence_id: string;
    status: string;
    source: string;
    occurrence: OccurrenceRow | null;
  }[]).filter((r) => r.occurrence && r.occurrence.starts_at > nowIso);

  const occupied = new Set(liveRows.map((r) => r.occurrence_id));
  const ownedFuture = liveRows.filter(
    (r) => r.source === "member" && r.status === "confirmed"
  );

  if (slots.length === 0) {
    // No active membership left at all — cancel every future materialised
    // booking for this participant.
    const cancelIds = ownedFuture.map((r) => r.id);
    if (cancelIds.length > 0) {
      const { error } = await service
        .from("mem_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .in("id", cancelIds)
        .eq("status", "confirmed")
        // Belt and braces on the most damaging mistake available here: even
        // if the id set were ever wrong, this cannot cancel a PAID booking.
        .eq("source", "member");
      if (error) throw error;
    }
    return { participantId, created: 0, cancelled: cancelIds.length };
  }

  const offeringIds = [...new Set(slots.map((s) => s.offering_id))];

  // Every future scheduled occurrence of the offerings this participant's
  // Subscriptions could possibly cover. Narrowed further below by
  // slotCoversOccurrence() — the same tested function coverForOccurrence()
  // uses, so the two can never disagree about who is entitled.
  const { data: occurrences, error: occurrencesError } = await service
    .from("mem_occurrences")
    .select("id, offering_id, starts_at")
    .in("offering_id", offeringIds)
    .eq("status", "scheduled")
    .gt("starts_at", nowIso);
  if (occurrencesError) throw occurrencesError;

  const entitled = ((occurrences ?? []) as OccurrenceRow[]).filter((o) =>
    slots.some((s) => slotCoversOccurrence(s, o))
  );
  const entitledIds = new Set(entitled.map((o) => o.id));

  const toCreate = entitled.filter((o) => !occupied.has(o.id));
  const toCancel = ownedFuture.filter((r) => !entitledIds.has(r.occurrence_id));

  // One insert per occurrence rather than a single batch — a batch insert
  // is all-or-nothing, so one collision (e.g. a walk-in booked the same
  // occurrence between the read above and now) would silently drop every
  // other row in the batch too. A concurrent insert tripping the partial
  // unique index is expected, not an error — same handling as
  // recordWaiverConsent()'s duplicate-insert case.
  let created = 0;
  if (toCreate.length > 0 && accountId) {
    const results = await Promise.all(
      toCreate.map((o) =>
        service.from("mem_bookings").insert({
          account_id: accountId,
          participant_id: participantId,
          occurrence_id: o.id,
          status: "confirmed" as const,
          price_paid_pence: 0,
          source: "member" as const,
        })
      )
    );
    for (const { error } of results) {
      if (error) {
        if ((error as { code?: string }).code === "23505") continue;
        throw error;
      }
      created += 1;
    }
  }

  if (toCancel.length > 0) {
    const { error } = await service
      .from("mem_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .in("id", toCancel.map((r) => r.id))
      .eq("status", "confirmed")
      // As above — never cancellable down to a paid booking, whatever the
      // id set says.
      .eq("source", "member");
    if (error) throw error;
  }

  return { participantId, created, cancelled: toCancel.length };
}

/**
 * Reconcile every participant who has ever held a membership. Run daily
 * (Netlify scheduled function) — this is what catches an occurrence added
 * to a slot AFTER someone already subscribed to it; reconcileMemberBookings()
 * on its own only reacts to that participant's own membership changing.
 */
export async function reconcileAllMemberBookings(
  service: SupabaseClient
): Promise<ReconcileResult[]> {
  const { data, error } = await service
    .from("mem_memberships")
    .select("participant_id")
    .not("participant_id", "is", null);
  if (error) throw error;

  const participantIds = [
    ...new Set((data ?? []).map((m) => m.participant_id as string)),
  ];

  const results: ReconcileResult[] = [];
  for (const participantId of participantIds) {
    results.push(await reconcileMemberBookings(service, participantId));
  }
  return results;
}
