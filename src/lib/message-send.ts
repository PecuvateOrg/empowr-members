// Member messaging - the send pipeline (spec: planning/spec/member-messaging.md, "Sending").
//
// Order matters and is the point of this file:
//   1. the message row and one recipient row per account are written FIRST, so whatever happens next
//      is visible in the sent log;
//   2. email goes out in Resend batches of <=100, and each recipient's result is recorded against its
//      own row - a failure is stored on the message, never swallowed;
//   3. push goes to every subscription of every recipient, and a 404/410 deletes the dead one.
//
// Pure of I/O: the database, Resend and the push service come in as `deps`, so the verify suite can
// prove batching, idempotency keys, failure recording and dead-subscription cleanup without any of them.
// The real dependencies are wired in lib/message-store.ts.
import type { BatchEmail, BatchOutcome } from "@/lib/email";
import { buildMemberMessageEmail } from "@/lib/emails/member-message";
import {
  EMAIL_BATCH_SIZE,
  batchIdempotencyKey,
  chunk,
  mapLimit,
  pushPayload,
  type Audience,
  type RecipientPreview,
  type SenderRole,
} from "@/lib/message-core";
import { links, membersUrl } from "@/lib/links";
import type { PushOutcome, PushTarget } from "@/lib/push";

export type NewMessage = {
  id: string;
  requestId: string;
  senderUserId: string;
  senderRole: SenderRole;
  senderName: string;
  /** Full From header and sign-off, decided by senderIdentity() - never built from user input here. */
  from: string;
  signOff: string | null;
  audience: Audience;
  audienceLabel: string;
  subject: string;
  body: string;
  urgent: boolean;
};

export type EmailRecord = { accountId: string; status: "sent" | "failed"; emailId?: string; error?: string };
export type Subscription = PushTarget & { id: string; accountId: string };

export type MessageStore = {
  /** Insert the message. `duplicate` when a message with the same request id already exists. */
  insertMessage(message: NewMessage): Promise<{ duplicate: false } | { duplicate: true; id: string }>;
  insertRecipients(messageId: string, recipients: RecipientPreview[]): Promise<void>;
  /** Login email per account id; accounts with no login are simply absent. */
  accountEmails(accountIds: string[]): Promise<Map<string, string>>;
  recordEmail(messageId: string, records: EmailRecord[]): Promise<void>;
  subscriptions(accountIds: string[]): Promise<Subscription[]>;
  deleteSubscriptions(ids: string[]): Promise<void>;
  recordPush(messageId: string, sentByAccount: Map<string, number>, usedSubscriptionIds: string[]): Promise<void>;
};

export type SendDeps = {
  store: MessageStore;
  sendBatch: (items: BatchEmail[], idempotencyKey: string) => Promise<BatchOutcome[]>;
  sendPush: (target: PushTarget, payload: ReturnType<typeof pushPayload>) => Promise<PushOutcome>;
};

export type SendSummary = {
  messageId: string;
  duplicate: boolean;
  recipients: number;
  emailSent: number;
  emailFailed: number;
  pushSent: number;
  pushRemoved: number;
  /** Things that went wrong that staff should know about (also shown on the message). */
  problems: string[];
};

const NO_LOGIN = "This account has no login email to send to.";

export async function sendMessage(
  deps: SendDeps,
  message: NewMessage,
  recipients: RecipientPreview[]
): Promise<SendSummary> {
  const { store } = deps;
  const summary: SendSummary = {
    messageId: message.id,
    duplicate: false,
    recipients: recipients.length,
    emailSent: 0,
    emailFailed: 0,
    pushSent: 0,
    pushRemoved: 0,
    problems: [],
  };

  const inserted = await store.insertMessage(message);
  if (inserted.duplicate) return { ...summary, messageId: inserted.id, duplicate: true };
  await store.insertRecipients(message.id, recipients);

  // --- Email ---------------------------------------------------------------------------------------
  const records: EmailRecord[] = [];
  try {
    const emails = await store.accountEmails(recipients.map((r) => r.accountId));
    const sendable: { recipient: RecipientPreview; email: BatchEmail }[] = [];
    for (const recipient of recipients) {
      const to = emails.get(recipient.accountId);
      if (!to) {
        records.push({ accountId: recipient.accountId, status: "failed", error: NO_LOGIN });
        continue;
      }
      const built = buildMemberMessageEmail({
        subject: message.subject,
        body: message.body,
        urgent: message.urgent,
        signOff: message.signOff,
        audienceLabel: message.audienceLabel,
        participantNames: recipient.participantNames,
        messageUrl: membersUrl(`/messages/${message.id}`),
      });
      sendable.push({
        recipient,
        email: { from: message.from, replyTo: links.bookingsEmail, to, subject: built.subject, html: built.html, text: built.text },
      });
    }
    const batches = chunk(sendable, EMAIL_BATCH_SIZE);
    for (const [index, batch] of batches.entries()) {
      const outcomes = await deps.sendBatch(
        batch.map((b) => b.email),
        batchIdempotencyKey(message.id, index)
      );
      batch.forEach((b, i) => {
        const outcome = outcomes[i];
        if (outcome && "id" in outcome) records.push({ accountId: b.recipient.accountId, status: "sent", emailId: outcome.id });
        else records.push({ accountId: b.recipient.accountId, status: "failed", error: outcome?.error ?? "No result from the email service" });
      });
    }
  } catch (err) {
    console.error("message email stage failed", message.id, err);
    summary.problems.push("Email sending hit an unexpected error. Check the sent log for who was reached.");
    const done = new Set(records.map((r) => r.accountId));
    for (const r of recipients) {
      if (!done.has(r.accountId)) records.push({ accountId: r.accountId, status: "failed", error: "Email sending hit an unexpected error." });
    }
  }
  summary.emailSent = records.filter((r) => r.status === "sent").length;
  summary.emailFailed = records.filter((r) => r.status === "failed").length;
  try {
    await store.recordEmail(message.id, records);
  } catch (err) {
    console.error("recording email results failed", message.id, err);
    summary.problems.push("Email was attempted but the results could not be saved; recipients will show as pending.");
  }

  // --- Push ----------------------------------------------------------------------------------------
  try {
    const subs = await store.subscriptions(recipients.map((r) => r.accountId));
    const payload = pushPayload(message);
    const outcomes = await mapLimit(subs, 10, async (sub) => ({ sub, outcome: await deps.sendPush(sub, payload) }));
    const sentByAccount = new Map<string, number>();
    const gone: string[] = [];
    const used: string[] = [];
    for (const { sub, outcome } of outcomes) {
      if (outcome === "sent") {
        sentByAccount.set(sub.accountId, (sentByAccount.get(sub.accountId) ?? 0) + 1);
        used.push(sub.id);
      } else if (outcome === "gone") gone.push(sub.id);
    }
    if (gone.length > 0) await store.deleteSubscriptions(gone);
    if (sentByAccount.size > 0) await store.recordPush(message.id, sentByAccount, used);
    summary.pushSent = used.length;
    summary.pushRemoved = gone.length;
  } catch (err) {
    console.error("message push stage failed", message.id, err);
    summary.problems.push("Push alerts hit an unexpected error. Email and the inbox are unaffected.");
  }

  return summary;
}
