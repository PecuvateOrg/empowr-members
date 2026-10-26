// Member messaging - the pure rules (spec: planning/spec/member-messaging.md).
//
// No server-only, no database, no network: client components and the verify suites import this
// directly. Anything that decides WHO may send to WHOM, or what a sender looks like to a family, is
// here so it can be tested without a request.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";
import { links } from "@/lib/links";

export const SUBJECT_MAX = 120;
export const BODY_MAX = 2000;
/** A coach may message a session starting from the beginning of today, up to and including this many
 *  days ahead (London calendar days). */
export const COACH_WINDOW_DAYS = 7;
/** Resend's batch endpoint takes at most 100 emails per call. */
export const EMAIL_BATCH_SIZE = 100;

export type SenderRole = "admin" | "coach";
export type AudienceType = "occurrence" | "offering" | "account";
export type Audience = { type: AudienceType; id: string };

export type SessionOption = { id: string; label: string };
export type OfferingOption = { id: string; title: string };

export type RecipientPreview = {
  accountId: string;
  accountName: string;
  participantNames: string[];
};

// --- Who may send what ----------------------------------------------------------------------------

/** [from, until): start of today (London) to the start of the day AFTER the last allowed day. */
export function coachWindow(now: Date): { from: Date; until: Date } {
  const today = formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd");
  const last = new Date(`${today}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + COACH_WINDOW_DAYS + 1);
  const untilDay = last.toISOString().slice(0, 10);
  return {
    from: fromZonedTime(`${today}T00:00:00`, TIMEZONE),
    until: fromZonedTime(`${untilDay}T00:00:00`, TIMEZONE),
  };
}

export type Gate = { ok: true } | { ok: false; status: 403; error: string };

/** The one place the audience rules live. `startsAt` is the occurrence's start for an occurrence
 *  audience (null when it could not be found). Admin may message any audience; a coach only a single
 *  session in the window. */
export function authoriseAudience(
  role: SenderRole,
  audience: Audience,
  startsAt: string | null,
  now: Date = new Date()
): Gate {
  if (role === "admin") return { ok: true };
  if (audience.type !== "occurrence") {
    return { ok: false, status: 403, error: "Coaches can message the families booked on one session only." };
  }
  if (!startsAt) return { ok: false, status: 403, error: "That session could not be found." };
  const { from, until } = coachWindow(now);
  const t = new Date(startsAt).getTime();
  if (t < from.getTime() || t >= until.getTime()) {
    return {
      ok: false,
      status: 403,
      error: `Coaches can message sessions from today to ${COACH_WINDOW_DAYS} days ahead. Ask an administrator for anything else.`,
    };
  }
  return { ok: true };
}

// --- Sender identity ------------------------------------------------------------------------------

export const ADMIN_SENDER_NAME = "Empowr CIC";

/** First word of a name, stripped of anything that could break out of a From header. */
export function firstName(name: string | null | undefined): string {
  const word = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return word.replace(/["<>,;:\\\r\n()[\]@]/g, "").slice(0, 40);
}

export type SenderIdentity =
  | { ok: true; senderName: string; from: string; signOff: string | null }
  | { ok: false; error: string };

/** Decided server-side from the role gate, never typed by the sender. Coach: "<first> at Empowr CIC".
 *  Admin: "Empowr CIC". Both send from the bookings@ address. */
export function senderIdentity(role: SenderRole, accountName: string | null | undefined): SenderIdentity {
  const address = links.bookingsEmail;
  if (role === "admin") {
    return { ok: true, senderName: ADMIN_SENDER_NAME, from: `"${ADMIN_SENDER_NAME}" <${address}>`, signOff: null };
  }
  const first = firstName(accountName);
  if (!first || first === "Deleted") {
    return {
      ok: false,
      error: "Your account has no name yet. Add your name on your account page before sending a message.",
    };
  }
  return {
    ok: true,
    senderName: first,
    from: `"${first} at ${ADMIN_SENDER_NAME}" <${address}>`,
    signOff: `${first}, ${ADMIN_SENDER_NAME}`,
  };
}

// --- Message text ---------------------------------------------------------------------------------

/** "URGENT: " goes in the email subject and the push title; the stored subject is as written. */
export function displaySubject(subject: string, urgent: boolean): string {
  return urgent ? `URGENT: ${subject}` : subject;
}

/** The push body: the first non-empty line, cut short. */
export function firstLine(body: string, max = 140): string {
  const line = body.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export type PushPayload = { title: string; body: string; url: string; urgent: boolean };

export function pushPayload(message: { id: string; subject: string; body: string; urgent: boolean }): PushPayload {
  return {
    title: displaySubject(message.subject, message.urgent),
    body: firstLine(message.body),
    url: `/messages/${message.id}`,
    urgent: message.urgent,
  };
}

/** "6 families, 7 children" - what staff confirm before sending. */
export function describeRecipients(recipients: RecipientPreview[], audienceType: AudienceType): string {
  const families = recipients.length;
  const familyWord = `${families} ${families === 1 ? "family" : "families"}`;
  if (audienceType === "account") return families === 1 ? "1 member" : `${families} members`;
  const children = new Set(recipients.flatMap((r) => r.participantNames.map((n) => `${r.accountId}:${n}`))).size;
  return `${familyWord}, ${children} ${children === 1 ? "child" : "children"}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `fn` over `items` at most `limit` at a time, results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const group of chunk(items, limit)) out.push(...(await Promise.all(group.map(fn))));
  return out;
}

/** Resend idempotency key for batch `index`. The first batch uses the bare message id (the spec's key);
 *  later batches carry different payloads, so they need distinct keys or Resend rejects them. */
export function batchIdempotencyKey(messageId: string, index: number): string {
  return index === 0 ? messageId : `${messageId}-${index}`;
}
