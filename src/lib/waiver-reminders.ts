// Waiver renewal reminders, run from the nightly materialize-member-bookings
// function. Guard-free (no `server-only`) for the same reason as
// lib/materialize-member-bookings.ts: the function bundle would die on import.
//
// A household gets one email listing everyone whose waiver lapses within
// REMINDER_WINDOW. reminder_sent_at is stamped only after Resend accepts the
// email, so a failed send is retried the next night rather than lost.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildWaiverRenewalEmail } from "@/lib/emails/waiver-renewal";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/emails/shell";
import { formatDate } from "@/lib/format";

const REMINDER_WINDOW = "14 days";

type DueRow = {
  consent_id: string;
  account_id: string;
  account_name: string;
  email: string;
  participant_name: string;
  expires_at: string;
};

/** `checked: false` means the read failed — never report that as "0 due". */
export async function sendWaiverRenewalReminders(
  service: SupabaseClient,
  resendKey: string | undefined
): Promise<{ checked: boolean; due: number; sent: number; failed: number }> {
  const { data, error } = await service.rpc("mem_waiver_reminders_due", {
    p_within: REMINDER_WINDOW,
  });
  if (error) {
    console.error("[waiver-reminders] due read failed", error);
    return { checked: false, due: 0, sent: 0, failed: 0 };
  }
  const rows = (data ?? []) as DueRow[];
  if (rows.length === 0) return { checked: true, due: 0, sent: 0, failed: 0 };
  if (!resendKey) {
    console.error("[waiver-reminders] RESEND_API_KEY not set —", rows.length, "reminders not sent");
    return { checked: true, due: rows.length, sent: 0, failed: rows.length };
  }

  const byAccount = new Map<string, DueRow[]>();
  for (const r of rows) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) ?? []), r]);

  const resend = new Resend(resendKey);
  let sent = 0;
  let failed = 0;
  for (const household of byAccount.values()) {
    const { subject, html } = buildWaiverRenewalEmail({
      accountName: household[0].account_name,
      people: household.map((r) => ({
        name: r.participant_name,
        renewBy: formatDate(r.expires_at),
      })),
    });
    const { error: sendError } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: household[0].email,
      subject,
      html,
    });
    if (sendError) {
      console.error("[waiver-reminders] send failed", household[0].account_id, sendError);
      failed += household.length;
      continue;
    }
    const { error: stampError } = await service
      .from("mem_waiver_consents")
      .update({ reminder_sent_at: new Date().toISOString() })
      .in("id", household.map((r) => r.consent_id));
    // Sent but not stamped means a repeat email tomorrow — log it, the
    // member is still reminded.
    if (stampError) console.error("[waiver-reminders] stamp failed", household[0].account_id, stampError);
    sent += household.length;
  }
  return { checked: true, due: rows.length, sent, failed };
}
