// Account deletion — the parts shared by the app (API routes) and the nightly Netlify function.
// Spec: planning/spec/account-deletion.md (owner-agreed 2026-10-22).
//
// ⚠️ NO `server-only` AND NO lib/supabase/service.ts IMPORT: the scheduled function bundle has no
// react-server condition, so either would make it throw on its first line (see
// netlify/functions/materialize-member-bookings.ts). Every client is passed in.
//
// 🔑 FAIL CLOSED. Anything that cannot be checked (a Stripe outage, a failed read) puts the
// request ON HOLD rather than letting erasure run past a dispute nobody looked at.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { links, membersUrl } from "@/lib/links";
import type { BrevoClient } from "@/lib/brevo";
import {
  buildDeletionCompleteEmail,
  buildDeletionReminderEmail,
  buildDeletionStaffAlertEmail,
  deletionStaffText,
  type DeletionStaffEvent,
} from "@/lib/emails/account-deletion";

export const GRACE_DAYS = 14;
export const CONFIRM_HOURS = 24;
const RECENT_SESSION_DAYS = 7;
const OVERDUE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export type Send = (msg: { to: string; subject: string; html: string }) => Promise<boolean>;

export type HoldReason = "staff_hold" | "stripe_dispute" | "stripe_unchecked" | "refund_in_progress" | "recent_session" | "upcoming_session";
/** Holds that need a person: the request goes ON HOLD, staff are emailed, and it waits for staff
 *  to release or reverse it. Both are also copied to legal@ (owner 2026-10-22). */
export const PERSISTENT_HOLDS: readonly HoldReason[] = ["staff_hold", "stripe_dispute"];
// The others (a session still booked or in the last 7 days, a refund still settling, a Stripe
// check that could not run) clear on their own: the nightly job just tries again the next night,
// and staff are told once if a request is still waiting a week after its date (OVERDUE_DAYS). Holding every
// recently active member for a person to release would bury the holds that matter.
export const persistentHolds = (reasons: HoldReason[]) => reasons.filter((r) => PERSISTENT_HOLDS.includes(r));

// ---- Signed links --------------------------------------------------------------------------
// Confirm and cancel links are signed from the request id, not stored: every reminder must carry
// the SAME working "Keep my account" link, which a stored one-way hash could not reproduce. The key
// is derived from the service-role key, which both the app and the scheduled function already hold
// and which never leaves the server.
type LinkKind = "confirm" | "cancel";

function linkKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

export function deletionLinkToken(kind: LinkKind, deletionId: string): string {
  return createHmac("sha256", linkKey()).update(`account-deletion:${kind}:${deletionId}`).digest("base64url");
}

export function verifyDeletionLinkToken(kind: LinkKind, deletionId: string, token: string): boolean {
  const expected = Buffer.from(deletionLinkToken(kind, deletionId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function deletionLink(kind: LinkKind, deletionId: string): string {
  return membersUrl(`/account-deletion/${kind}?id=${deletionId}&t=${deletionLinkToken(kind, deletionId)}`);
}

export const deletionRef = (deletionId: string) => `DEL-${deletionId.slice(0, 8)}`;

// ---- Holds -----------------------------------------------------------------------------------
const OPEN_DISPUTE = new Set(["warning_needs_response", "warning_under_review", "needs_response", "under_review"]);

/** Every reason this account's erasure must wait for a person. Empty = clear to erase. */
export async function deletionHolds(service: SupabaseClient, stripe: Stripe | null, accountId: string): Promise<HoldReason[]> {
  const reasons: HoldReason[] = [];

  const { data: account, error: accountError } = await service
    .from("mem_accounts").select("deletion_hold, stripe_customer_id").eq("id", accountId).single();
  if (accountError) throw accountError;
  if (account.deletion_hold) reasons.push("staff_hold");

  const { count: openRefunds, error: refundError } = await service
    .from("mem_booking_refunds").select("booking_id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("completed", false);
  if (refundError) throw refundError;
  if (openRefunds) reasons.push("refund_in_progress");

  if (await attendedRecently(service, accountId)) reasons.push("recent_session");
  const lastEnd = await lastBookedSessionEnd(service, accountId);
  if (lastEnd && lastEnd.getTime() > Date.now()) reasons.push("upcoming_session");

  if (account.stripe_customer_id) {
    if (!stripe) reasons.push("stripe_unchecked");
    else {
      try {
        // `disputed` marks a charge that was EVER disputed; only an open dispute holds.
        let open = false;
        for await (const charge of stripe.charges.list({ customer: account.stripe_customer_id, limit: 100 })) {
          if (!charge.disputed) continue;
          // The live Members key cannot read disputes (403 more_permissions_required, checked
          // 2026-10-23). Then a disputed charge whose status cannot be read counts as OPEN: staff
          // look and release it. Granting "Disputes: Read" makes this exact.
          const status = await stripe.disputes.list({ charge: charge.id, limit: 10 })
            .then((d) => d.data.some((x) => OPEN_DISPUTE.has(x.status)))
            .catch(() => true);
          if (status) { open = true; break; }
        }
        if (open) reasons.push("stripe_dispute");
      } catch (err) {
        console.error("[account-deletion] Stripe dispute check failed", accountId, err);
        reasons.push("stripe_unchecked");
      }
    }
  }
  return reasons;
}

/** When the last session this account is still booked on ends: its own bookings and courses, and
 *  private bookings it hosts or has a place on. Bookings kept on deletion (inside 48 hours,
 *  non-refundable — a camp can be weeks away) still happen, and the register needs the skater's
 *  details and emergency contact for them, so erasure must wait until they are over. */
export async function lastBookedSessionEnd(service: SupabaseClient, accountId: string): Promise<Date | null> {
  const live = ["confirmed", "pending_payment"];
  const [bookings, hosted, places] = await Promise.all([
    service.from("mem_bookings").select("occurrence:mem_occurrences(ends_at), course_run:mem_course_runs(ends_on)").eq("account_id", accountId).in("status", live),
    service.from("mem_private_bookings").select("ends_at").eq("host_account_id", accountId).in("status", live),
    service.from("mem_private_booking_places").select("private_booking:mem_private_bookings(ends_at, status)").eq("account_id", accountId),
  ]);
  for (const r of [bookings, hosted, places]) if (r.error) throw r.error;
  const ends: string[] = [];
  for (const b of (bookings.data ?? []) as unknown as { occurrence: { ends_at: string } | null; course_run: { ends_on: string | null } | null }[]) {
    if (b.occurrence?.ends_at) ends.push(b.occurrence.ends_at);
    // A course ends on a date; count it as the end of that day.
    if (b.course_run?.ends_on) ends.push(`${b.course_run.ends_on}T23:59:59Z`);
  }
  for (const h of (hosted.data ?? []) as { ends_at: string }[]) ends.push(h.ends_at);
  for (const p of (places.data ?? []) as unknown as { private_booking: { ends_at: string; status: string } | null }[]) {
    if (p.private_booking && live.includes(p.private_booking.status)) ends.push(p.private_booking.ends_at);
  }
  const last = Math.max(...ends.map((e) => Date.parse(e)).filter((t) => !Number.isNaN(t)));
  return Number.isFinite(last) ? new Date(last) : null;
}

/** Day 14, or 7 days after the last booked session if that is later. */
export async function eraseAfterFor(service: SupabaseClient, accountId: string, from = new Date()): Promise<Date> {
  const grace = from.getTime() + GRACE_DAYS * DAY;
  const lastEnd = await lastBookedSessionEnd(service, accountId);
  return new Date(Math.max(grace, lastEnd ? lastEnd.getTime() + RECENT_SESSION_DAYS * DAY : 0));
}

/** A session in the last 7 days, so an incident from it can be logged before the data goes. */
async function attendedRecently(service: SupabaseClient, accountId: string): Promise<boolean> {
  const since = new Date(Date.now() - RECENT_SESSION_DAYS * DAY);
  const { data: bookings, error } = await service
    .from("mem_bookings")
    .select("id, occurrence:mem_occurrences(starts_at)")
    .eq("account_id", accountId)
    .in("status", ["confirmed", "attended"]);
  if (error) throw error;
  const rows = (bookings ?? []) as unknown as { id: string; occurrence: { starts_at: string } | null }[];
  const now = Date.now();
  if (rows.some((b) => b.occurrence && Date.parse(b.occurrence.starts_at) >= since.getTime() && Date.parse(b.occurrence.starts_at) <= now)) return true;
  if (rows.length === 0) return false;
  const { count, error: attendanceError } = await service
    .from("mem_course_attendance").select("booking_id", { count: "exact", head: true })
    .in("booking_id", rows.map((b) => b.id)).gte("session_date", since.toISOString().slice(0, 10));
  if (attendanceError) throw attendanceError;
  return Boolean(count);
}

// ---- Staff alerts ----------------------------------------------------------------------------
/** Events that close the request's CRM escalation; every other event opens or re-opens it. */
const CLOSING_EVENTS: readonly DeletionStaffEvent[] = ["erased", "cancelled", "reversed"];

/** One PecuvateCRM escalation per request (owner 2026-10-22), keyed by a stable ref so every event
 *  lands on the same record. Returns its dashboard URL, or null when the CRM is not configured or
 *  did not take it — the caller then falls back to email. No personal data is sent. */
async function postToCrm(d: { event: DeletionStaffEvent; deletionId: string; holdReasons: HoldReason[] }): Promise<string | null> {
  const key = process.env.CRM_CONTACT_API_KEY;
  if (!key) return null;
  const base = process.env.CRM_API_BASE_URL ?? "https://crm.pecuvate.com";
  const ref = deletionRef(d.deletionId);
  const message = [
    deletionStaffText(d.event),
    `Reference: ${ref}`,
    d.holdReasons.length ? `Hold reasons: ${d.holdReasons.join(", ")}` : "",
    `Admin: ${membersUrl(`/admin/deletions#${d.deletionId}`)}`,
  ].filter(Boolean).join("\n");
  try {
    const res = await fetch(`${base}/api/channels/system-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-contact-form-secret": key },
      body: JSON.stringify({
        orgSlug: "empowr-cic",
        ref: `members-deletion:${d.deletionId}`,
        subject: `Members account deletion ${ref}`,
        message,
        state: CLOSING_EVENTS.includes(d.event) ? "resolved" : "open",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[account-deletion] CRM returned", res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  } catch (err) {
    console.error("[account-deletion] CRM unreachable", err);
    return null;
  }
}

/** The CRM escalation first, bookings@ by email if that fails; legal@ by email for a legal hold,
 *  with a link to the CRM record. Never throws. */
export async function notifyDeletionStaff(
  send: Send,
  d: { event: DeletionStaffEvent; deletionId: string; holdReasons?: HoldReason[] }
): Promise<void> {
  try {
    const holdReasons = d.holdReasons ?? [];
    const crmUrl = await postToCrm({ ...d, holdReasons });
    const { subject, html } = buildDeletionStaffAlertEmail({
      event: d.event,
      ref: deletionRef(d.deletionId),
      holdReasons,
      adminUrl: membersUrl(`/admin/deletions#${d.deletionId}`),
      crmUrl,
    });
    if (!crmUrl) await send({ to: links.staffBookingAlerts, subject, html });
    if (d.event === "held" && holdReasons.some((r) => PERSISTENT_HOLDS.includes(r))) {
      await send({ to: links.staffLegalAlerts, subject, html });
    }
  } catch (err) {
    console.error("[account-deletion] staff alert failed", d, err);
  }
}

// ---- Login lock ------------------------------------------------------------------------------
/** The grace-period lock is a Supabase auth ban: the member cannot sign in or refresh a session,
 *  with no app-wide checks. ~100 years; "none" lifts it. */
export async function setLoginLocked(service: SupabaseClient, userId: string | null, locked: boolean): Promise<void> {
  if (!userId) return;
  const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: locked ? "876000h" : "none" });
  if (error) throw error;
}

export async function accountEmail(service: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.email ?? null;
}

// ---- Nightly job ------------------------------------------------------------------------------
type DeletionRow = {
  id: string;
  account_id: string;
  status: string;
  confirmed_at: string | null;
  erase_after: string | null;
  reminder_7_sent_at: string | null;
  reminder_13_sent_at: string | null;
  outcome: Record<string, unknown> | null;
  account: { user_id: string | null; stripe_customer_id: string | null } | null;
};

const ROW = "id, account_id, status, confirmed_at, erase_after, reminder_7_sent_at, reminder_13_sent_at, outcome, account:mem_accounts(user_id, stripe_customer_id)";

/** Halfway (day 7) and final (day 13) reminders. Each is sent at most once. */
export async function sendDeletionReminders(service: SupabaseClient, send: Send, now = new Date()) {
  const { data, error } = await service.from("mem_account_deletions").select(ROW).eq("status", "scheduled");
  if (error) throw error;
  let sent = 0;
  for (const row of (data ?? []) as unknown as DeletionRow[]) {
    if (!row.confirmed_at || !row.erase_after) continue;
    const eraseAt = Date.parse(row.erase_after);
    const kind =
      !row.reminder_13_sent_at && eraseAt - now.getTime() <= DAY && eraseAt > now.getTime() ? "final"
      : !row.reminder_7_sent_at && !row.reminder_13_sent_at && now.getTime() - Date.parse(row.confirmed_at) >= 7 * DAY && eraseAt - now.getTime() > DAY ? "halfway"
      : null;
    if (!kind) continue;
    const email = await accountEmail(service, row.account?.user_id ?? null);
    if (!email) continue;
    const msg = buildDeletionReminderEmail({ kind, eraseAfter: row.erase_after, cancelUrl: deletionLink("cancel", row.id) });
    if (await send({ to: email, ...msg })) {
      const column = kind === "final" ? "reminder_13_sent_at" : "reminder_7_sent_at";
      const { error: markError } = await service.from("mem_account_deletions").update({ [column]: now.toISOString(), updated_at: now.toISOString() }).eq("id", row.id);
      if (markError) throw markError;
      sent += 1;
    }
  }
  return { sent };
}

/** Erase every request whose grace period is over, re-checking holds first. One failure never
 *  stops the others; a failed or deferred erasure stays `scheduled` and is retried the next night. */
export async function runDueErasures(
  service: SupabaseClient,
  deps: { stripe: Stripe | null; brevo: BrevoClient | null; send: Send },
  now = new Date()
) {
  const { data, error } = await service
    .from("mem_account_deletions").select(ROW).eq("status", "scheduled").lte("erase_after", now.toISOString());
  if (error) throw error;
  const result = { erased: 0, held: 0, deferred: 0, failed: 0 };
  for (const row of (data ?? []) as unknown as DeletionRow[]) {
    try {
      const holds = await deletionHolds(service, deps.stripe, row.account_id);
      const persistent = persistentHolds(holds);
      if (persistent.length) {
        await updateDeletion(service, row.id, { status: "held", hold_reasons: persistent });
        await notifyDeletionStaff(deps.send, { event: "held", deletionId: row.id, holdReasons: persistent });
        result.held += 1;
        continue;
      }
      if (holds.length) {
        // Temporary: stays scheduled and is retried tomorrow night. A week past its date it is no
        // longer "temporary" in any useful sense (a stuck refund, a missing Stripe key), and the
        // one-month UK GDPR deadline is running, so staff are told, once.
        const overdue = Date.now() - Date.parse(row.erase_after ?? "") > OVERDUE_DAYS * DAY;
        const alerted = Boolean(row.outcome?.overdue_alerted);
        await updateDeletion(service, row.id, { hold_reasons: holds, ...(overdue && !alerted ? { outcome: { ...(row.outcome ?? {}), overdue_alerted: true } } : {}) });
        if (overdue && !alerted) await notifyDeletionStaff(deps.send, { event: "overdue", deletionId: row.id, holdReasons: holds });
        result.deferred += 1;
        continue;
      }
      await eraseAccount(service, deps, row);
      result.erased += 1;
    } catch (err) {
      console.error("[account-deletion] erasure failed", row.id, err);
      await notifyDeletionStaff(deps.send, { event: "failed", deletionId: row.id });
      result.failed += 1;
    }
  }
  return result;
}

async function updateDeletion(service: SupabaseClient, id: string, fields: Record<string, unknown>) {
  const { error } = await service.from("mem_account_deletions").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** The erasure sequence. Each external step records its progress on the request row, so a retry
 *  after a partial failure never redoes a step (no second "deleted" email, no second Stripe call). */
async function eraseAccount(service: SupabaseClient, deps: { stripe: Stripe | null; brevo: BrevoClient | null; send: Send }, row: DeletionRow) {
  const progress: Record<string, unknown> = { ...(row.outcome ?? {}) };
  const mark = async (step: string, value: unknown = true) => {
    progress[step] = value;
    await updateDeletion(service, row.id, { outcome: progress });
  };
  const userId = row.account?.user_id ?? null;
  const email = await accountEmail(service, userId);

  // 1. Stripe: delete the Members customer (Stripe keeps what it must for invoices). The account
  //    is shared with Empowr Heroes, so only a customer this app created FOR THIS ACCOUNT
  //    (getOrCreateStripeCustomer stamps app + mem_account_id) is ever touched.
  const customerId = row.account?.stripe_customer_id ?? null;
  if (customerId && !progress.stripe_customer) {
    if (!deps.stripe) throw new Error("Stripe client unavailable");
    const customer = await deps.stripe.customers.retrieve(customerId);
    if (customer.deleted) await mark("stripe_customer", "already_deleted");
    else if (customer.metadata?.app === "members" && customer.metadata?.mem_account_id === row.account_id) {
      await deps.stripe.customers.del(customerId);
      await mark("stripe_customer", "deleted");
    } else {
      // Not ours: leave it, and say so on the record.
      await mark("stripe_customer", "skipped_not_members");
    }
  }

  // 2. Brevo: delete the contact. The nightly Brevo reconcile resolves emails through the login,
  //    so once the login is gone (step 5) it cannot re-add this address.
  if (email && !progress.brevo) {
    if (deps.brevo) {
      await deps.brevo.deleteContact(email);
      await mark("brevo", "deleted");
    } else await mark("brevo", "not_configured");
  }

  // 3. The completion email, while the address still exists.
  if (email && !progress.completion_email) {
    const msg = buildDeletionCompleteEmail();
    await mark("completion_email", await deps.send({ to: email, ...msg }));
  }

  // 4. The database: one transaction, idempotent. Every booking, credit and refund row is kept.
  if (!progress.database) {
    const { data, error } = await service.rpc("mem_erase_account", { p_account_id: row.account_id });
    if (error) throw error;
    await mark("database", data);
  }

  // 5. The login. mem_accounts.user_id is ON DELETE SET NULL, so the anonymous row survives.
  if (userId) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  await updateDeletion(service, row.id, { status: "erased", ended_at: new Date().toISOString(), ended_by: "system", outcome: progress });
  await notifyDeletionStaff(deps.send, { event: "erased", deletionId: row.id });
}
