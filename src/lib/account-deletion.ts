// Account deletion — member and staff actions (server-only). Shared pieces, and the nightly
// erasure itself, live in lib/account-deletion-core.ts. Spec: planning/spec/account-deletion.md.
//
// Order on confirm is deliberate: money first (memberships cancelled, refundable bookings
// refunded), THEN the login lock, THEN the status. A failure part way leaves the member able to
// sign in and retry, never locked out with nothing scheduled.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { membersSubscriptionMeta } from "@/lib/stripe-subscription";
import { refundBooking } from "@/lib/credits";
import { evaluateCancellationPolicy } from "@/lib/cancellation";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { sendEmail } from "@/lib/email";
import { sendStaffRefundAlert } from "@/lib/notifications";
import {
  CONFIRM_HOURS,
  deletionHolds,
  eraseAfterFor,
  deletionLink,
  notifyDeletionStaff,
  persistentHolds,
  setLoginLocked,
  verifyDeletionLinkToken,
  accountEmail,
  type HoldReason,
} from "@/lib/account-deletion-core";
import {
  buildDeletionConfirmEmail,
  buildDeletionReactivatedEmail,
  buildDeletionScheduledEmail,
} from "@/lib/emails/account-deletion";

export const DELETION_REASONS = ["child_stopped", "moving_away", "too_expensive", "unhappy_sessions", "rather_not_say", "other"] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

const OPEN = ["pending_confirmation", "scheduled", "held"];

type OfferingJoin = { title: string; refund_policy: "standard" | "non_refundable" };
type UpcomingRow = {
  id: string;
  price_paid_pence: number | null;
  credit_applied_pence: number | null;
  stripe_payment_intent_id: string | null;
  occurrence: { starts_at: string; ends_at: string; offering: OfferingJoin | null } | null;
  course_run: { label: string; starts_on: string | null; ends_on: string | null; starts_at_local: string | null; ends_at_local: string | null; offering: OfferingJoin | null } | null;
};

export type UpcomingBooking = { id: string; title: string; when: string; outcome: "refunded" | "kept" };

/** What deleting would do to this account's future bookings, shown before the member confirms
 *  and applied on confirm. Refunded = the normal self-serve cancel would refund it; everything
 *  else (inside 48 hours, non-refundable, £0 membership places) is kept as it is. */
export async function upcomingBookings(accountId: string): Promise<(UpcomingBooking & { refundable: boolean })[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_bookings")
    .select(
      `id, price_paid_pence, credit_applied_pence, stripe_payment_intent_id,
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title, refund_policy)),
       course_run:mem_course_runs(label, starts_on, ends_on, starts_at_local, ends_at_local, offering:mem_offerings(title, refund_policy))`
    )
    .eq("account_id", accountId)
    .eq("status", "confirmed");
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as unknown as UpcomingRow[]).flatMap((b) => {
    const offering = b.occurrence?.offering ?? b.course_run?.offering;
    const startsAt = b.occurrence?.starts_at ?? b.course_run?.starts_on;
    if (!offering || !startsAt || Date.parse(startsAt) <= now) return [];
    const price = b.price_paid_pence ?? 0;
    const card = price - (b.credit_applied_pence ?? 0);
    // The same gates as POST /api/bookings/[id]/cancel: the policy, and something to give back.
    const refundable =
      evaluateCancellationPolicy(offering.refund_policy, startsAt).allowed &&
      price > 0 && !(card > 0 && !b.stripe_payment_intent_id);
    const when = b.occurrence ? formatOccurrence(b.occurrence.starts_at, b.occurrence.ends_at) : b.course_run ? courseRunWhen(b.course_run) : "";
    return [{ id: b.id, title: offering.title, when, refundable, outcome: refundable ? "refunded" as const : "kept" as const }];
  });
}

export async function openDeletion(accountId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_account_deletions").select("id, status, erase_after").eq("account_id", accountId).in("status", OPEN).maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string; erase_after: string | null } | null;
}

/** Step 1: the member asks. Nothing changes until they confirm from the email. */
export async function requestDeletion(account: { id: string }, email: string, reason: DeletionReason | null, detail: string | null) {
  const service = createServiceClient();
  if (await openDeletion(account.id)) return { alreadyOpen: true as const };

  // The reason is stored with NO link to the account, so it survives erasure.
  if (reason) {
    const { error } = await service.from("mem_account_deletion_reasons").insert({ reason, detail: reason === "other" ? detail : null });
    if (error) throw error;
  }
  const { data, error } = await service
    .from("mem_account_deletions").insert({ account_id: account.id, status: "pending_confirmation" }).select("id").single();
  if (error) throw error;

  const msg = buildDeletionConfirmEmail({ confirmUrl: deletionLink("confirm", data.id) });
  if (!(await sendEmail({ to: email, ...msg }))) throw new Error("confirmation_email_failed");
  if (reason === "unhappy_sessions") await notifyDeletionStaff(sendEmail, { event: "unhappy", deletionId: data.id });
  return { alreadyOpen: false as const };
}

/** Step 2: the member confirms from the emailed link. */
export async function confirmDeletion(deletionId: string, token: string) {
  if (!verifyDeletionLinkToken("confirm", deletionId, token)) return { ok: false as const, reason: "invalid" as const };
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("mem_account_deletions")
    .select("id, account_id, status, requested_at, account:mem_accounts(user_id)")
    .eq("id", deletionId).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false as const, reason: "invalid" as const };
  if (row.status === "scheduled" || row.status === "held") return { ok: true as const, already: true };
  if (row.status !== "pending_confirmation") return { ok: false as const, reason: "closed" as const };
  if (Date.now() - Date.parse(row.requested_at) > CONFIRM_HOURS * 60 * 60 * 1000) return { ok: false as const, reason: "expired" as const };
  const userId = (row.account as unknown as { user_id: string | null } | null)?.user_id ?? null;
  const stripe = getStripe();

  // Memberships: cancelled now, so no further payment is taken.
  const { data: memberships, error: mErr } = await service
    .from("mem_memberships").select("stripe_subscription_id")
    .eq("account_id", row.account_id).in("status", ["active", "past_due"]).not("stripe_subscription_id", "is", null);
  if (mErr) throw mErr;
  for (const m of memberships ?? []) {
    const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id as string);
    // Shared Stripe account: only a subscription positively identified as this account's.
    if (membersSubscriptionMeta(sub)?.accountId !== row.account_id) continue;
    if (sub.status !== "canceled") await stripe.subscriptions.cancel(sub.id);
  }

  // Upcoming bookings: refunded exactly as the self-serve cancel would; the rest are kept.
  const bookings = await upcomingBookings(row.account_id);
  const summary: UpcomingBooking[] = [];
  for (const b of bookings) {
    if (!b.refundable) { summary.push(b); continue; }
    try {
      await refundBooking(b.id, row.account_id);
      summary.push(b);
    } catch (err) {
      // The durable claim stays and delays erasure until it settles; staff are told now, exactly
      // as the self-serve cancel route does, because past 23 hours it needs a person.
      console.error("[account-deletion] refund on confirm failed", b.id, err);
      await sendStaffRefundAlert({
        reason: "not_accepted",
        bookingId: b.id,
        memberEmail: await accountEmail(service, userId),
        cardPence: null,
        paymentIntentId: null,
        refundId: null,
        detail: err instanceof Error ? err.message : String(err),
      });
      summary.push({ ...b, outcome: "kept" });
    }
  }

  const { data: credits, error: cErr } = await service.from("mem_credit_balances").select("available_pence").eq("account_id", row.account_id);
  if (cErr) throw cErr;
  const creditPence = (credits ?? []).reduce((n, c) => n + (c.available_pence as number), 0);

  const holds = persistentHolds(await deletionHolds(service, stripe, row.account_id));
  await setLoginLocked(service, userId, true);

  const now = new Date();
  // Day 14, or a week after the last session still booked (a kept camp, a private booking).
  const eraseAfter = (await eraseAfterFor(service, row.account_id, now)).toISOString();
  const { error: uErr } = await service.from("mem_account_deletions").update({
    status: holds.length ? "held" : "scheduled",
    confirmed_at: now.toISOString(),
    erase_after: eraseAfter,
    hold_reasons: holds,
    outcome: {
      bookings_refunded: summary.filter((b) => b.outcome === "refunded").length,
      bookings_kept: summary.filter((b) => b.outcome === "kept").length,
      memberships_cancelled: (memberships ?? []).length,
      credit_pence_at_request: creditPence,
    },
    updated_at: now.toISOString(),
  }).eq("id", deletionId).eq("status", "pending_confirmation");
  if (uErr) throw uErr;

  const email = await accountEmail(service, userId);
  if (email) {
    const msg = buildDeletionScheduledEmail({
      eraseAfter,
      cancelUrl: deletionLink("cancel", deletionId),
      held: holds.length > 0,
      bookings: summary,
      membershipsCancelled: (memberships ?? []).length,
      creditPence,
    });
    await sendEmail({ to: email, ...msg });
  }
  await notifyDeletionStaff(sendEmail, holds.length
    ? { event: "held", deletionId, holdReasons: holds }
    : { event: "requested", deletionId });
  return { ok: true as const, already: false };
}

/** The member cancels from an emailed link, or staff reverse it from admin. */
export async function endDeletion(deletionId: string, by: { member: true; token: string } | { staffEmail: string }) {
  if ("member" in by && !verifyDeletionLinkToken("cancel", deletionId, by.token)) return { ok: false as const, reason: "invalid" as const };
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("mem_account_deletions").select("id, status, account:mem_accounts(user_id)").eq("id", deletionId).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false as const, reason: "invalid" as const };
  if (row.status === "cancelled" || row.status === "reversed") return { ok: true as const, already: true };
  if (!OPEN.includes(row.status)) return { ok: false as const, reason: "closed" as const };
  const userId = (row.account as unknown as { user_id: string | null } | null)?.user_id ?? null;
  const byStaff = !("member" in by);

  await setLoginLocked(service, userId, false);
  const { error: uErr } = await service.from("mem_account_deletions").update({
    status: byStaff ? "reversed" : "cancelled",
    ended_at: new Date().toISOString(),
    ended_by: byStaff ? by.staffEmail : "member",
    updated_at: new Date().toISOString(),
  }).eq("id", deletionId).in("status", OPEN);
  if (uErr) throw uErr;

  const email = await accountEmail(service, userId);
  if (email && row.status !== "pending_confirmation") await sendEmail({ to: email, ...buildDeletionReactivatedEmail({ byStaff }) });
  await notifyDeletionStaff(sendEmail, { event: byStaff ? "reversed" : "cancelled", deletionId });
  return { ok: true as const, already: false };
}

/** Staff release a held request. The staff hold flag is cleared with it (releasing IS the staff
 *  decision); a dispute still open is caught again by the nightly re-check. */
export async function releaseDeletion(deletionId: string) {
  const service = createServiceClient();
  const { data: row, error } = await service.from("mem_account_deletions").select("id, account_id, status").eq("id", deletionId).maybeSingle();
  if (error) throw error;
  if (!row || row.status !== "held") return { ok: false as const };
  const { error: aErr } = await service.from("mem_accounts").update({ deletion_hold: false, deletion_hold_note: null }).eq("id", row.account_id);
  if (aErr) throw aErr;
  const { error: uErr } = await service.from("mem_account_deletions")
    .update({ status: "scheduled", hold_reasons: [], updated_at: new Date().toISOString() }).eq("id", deletionId).eq("status", "held");
  if (uErr) throw uErr;
  await notifyDeletionStaff(sendEmail, { event: "released", deletionId });
  return { ok: true as const };
}

/** Staff set or clear the account's hold. Setting it on an account with an open request holds
 *  that request straight away. */
export async function setStaffHold(accountId: string, hold: boolean, note: string | null) {
  const service = createServiceClient();
  const { error } = await service.from("mem_accounts")
    .update({ deletion_hold: hold, deletion_hold_note: hold ? note : null }).eq("id", accountId);
  if (error) throw error;
  const open = await openDeletion(accountId);
  if (hold && open?.status === "scheduled") {
    const reasons: HoldReason[] = ["staff_hold"];
    const { error: uErr } = await service.from("mem_account_deletions")
      .update({ status: "held", hold_reasons: reasons, updated_at: new Date().toISOString() }).eq("id", open.id).eq("status", "scheduled");
    if (uErr) throw uErr;
    await notifyDeletionStaff(sendEmail, { event: "held", deletionId: open.id, holdReasons: reasons });
  }
}
