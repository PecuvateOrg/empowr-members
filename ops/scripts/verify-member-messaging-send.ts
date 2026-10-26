// Proves the send pipeline (src/lib/message-send.ts) and the push transport (src/lib/push.ts).
// Spec: planning/spec/member-messaging.md, "Sending".
//
// The database, Resend and the push service are replaced by in-memory fakes, so what is under test is the
// orchestration: ordering (rows first), batches of <=100 with distinct idempotency keys, every failure
// recorded against the recipient it belongs to, dead subscriptions deleted, and push being a quiet no-op
// when no keys are configured.
import { test, mock } from "node:test";
import assert from "node:assert/strict";

mock.module("server-only", { namedExports: {} });

const { sendMessage } = await import("@/lib/message-send");
const { sendPush, pushConfigured } = await import("@/lib/push");
import type { BatchEmail, BatchOutcome } from "@/lib/email";
import type { EmailRecord, MessageStore, NewMessage, SendDeps, Subscription } from "@/lib/message-send";
import type { RecipientPreview } from "@/lib/message-core";
import type { PushOutcome } from "@/lib/push";

const people = (n: number): RecipientPreview[] =>
  Array.from({ length: n }, (_, i) => ({ accountId: `acc-${i}`, accountName: `Parent ${i}`, participantNames: [`Kid ${i}`] }));

const message = (over: Partial<NewMessage> = {}): NewMessage => ({
  id: "msg-1",
  requestId: "req-1",
  senderUserId: "user-1",
  senderRole: "coach",
  senderName: "Sam",
  from: '"Sam at Empowr CIC" <bookings@empowrcic.org>',
  signOff: "Sam, Empowr CIC",
  audience: { type: "occurrence", id: "occ-1" },
  audienceLabel: "Skate Jam - Mon 26 Oct 2026, 4pm-5pm",
  subject: "Late start",
  body: "We start at 4.30.",
  urgent: false,
  ...over,
});

function fakes(opts: {
  noLogin?: string[];
  subs?: Subscription[];
  duplicate?: boolean;
  batchOutcome?: (items: BatchEmail[], key: string) => BatchOutcome[] | Error;
  pushOutcome?: (sub: Subscription) => PushOutcome;
} = {}) {
  const log = {
    events: [] as string[],
    messages: [] as NewMessage[],
    recipients: [] as RecipientPreview[],
    emailRecords: [] as EmailRecord[],
    batches: [] as { key: string; items: BatchEmail[] }[],
    deleted: [] as string[],
    pushCounts: new Map<string, number>(),
    pushCalls: [] as string[],
  };
  const store: MessageStore = {
    async insertMessage(m) {
      log.events.push("insertMessage");
      if (opts.duplicate) return { duplicate: true, id: "existing-msg" };
      log.messages.push(m);
      return { duplicate: false };
    },
    async insertRecipients(_id, r) {
      log.events.push("insertRecipients");
      log.recipients.push(...r);
    },
    async accountEmails(ids) {
      return new Map(ids.filter((id) => !opts.noLogin?.includes(id)).map((id) => [id, `${id}@example.test`]));
    },
    async recordEmail(_id, records) {
      log.events.push("recordEmail");
      log.emailRecords.push(...records);
    },
    async subscriptions(ids) {
      return (opts.subs ?? []).filter((s) => ids.includes(s.accountId));
    },
    async deleteSubscriptions(ids) {
      log.deleted.push(...ids);
    },
    async recordPush(_id, byAccount) {
      byAccount.forEach((n, k) => log.pushCounts.set(k, n));
    },
  };
  const deps: SendDeps = {
    store,
    async sendBatch(items, key) {
      log.events.push("sendBatch");
      log.batches.push({ key, items });
      const custom = opts.batchOutcome?.(items, key);
      if (custom instanceof Error) throw custom;
      return custom ?? items.map((_, i) => ({ id: `email-${key}-${i}` }));
    },
    async sendPush(sub) {
      log.pushCalls.push(sub.id);
      return opts.pushOutcome?.(sub as Subscription) ?? "sent";
    },
  };
  return { deps, log };
}

test("rows are written BEFORE anything is sent, so every outcome is visible in the log", async () => {
  const { deps, log } = fakes();
  await sendMessage(deps, message(), people(3));
  assert.deepEqual(log.events.slice(0, 3), ["insertMessage", "insertRecipients", "sendBatch"]);
  assert.equal(log.recipients.length, 3);
});

test("250 recipients go out as batches of 100/100/50 with distinct idempotency keys, the first being the message id", async () => {
  const { deps, log } = fakes();
  const summary = await sendMessage(deps, message(), people(250));
  assert.deepEqual(log.batches.map((b) => b.items.length), [100, 100, 50]);
  assert.deepEqual(log.batches.map((b) => b.key), ["msg-1", "msg-1-1", "msg-1-2"]);
  assert.equal(summary.emailSent, 250);
  assert.equal(summary.emailFailed, 0);
  assert.equal(new Set(log.emailRecords.map((r) => r.emailId)).size, 250, "each recipient keeps its own Resend id");
});

test("each email is addressed to its own recipient, from the coach, replying to bookings@, with that family's children", async () => {
  const { deps, log } = fakes();
  await sendMessage(deps, message(), people(2));
  const [first, second] = log.batches[0].items;
  assert.equal(first.to, "acc-0@example.test");
  assert.equal(second.to, "acc-1@example.test");
  assert.equal(first.from, '"Sam at Empowr CIC" <bookings@empowrcic.org>');
  assert.equal(first.replyTo, "bookings@empowrcic.org");
  assert.match(first.html, /Kid 0/);
  assert.doesNotMatch(first.html, /Kid 1/);
  assert.match(first.html, /Sam, Empowr CIC/);
  assert.match(first.html, /Skate Jam/);
});

test("an account with no login email is recorded as FAILED with a reason, and the others still send", async () => {
  const { deps, log } = fakes({ noLogin: ["acc-1"] });
  const summary = await sendMessage(deps, message(), people(3));
  assert.equal(summary.emailSent, 2);
  assert.equal(summary.emailFailed, 1);
  const failed = log.emailRecords.find((r) => r.accountId === "acc-1");
  assert.equal(failed?.status, "failed");
  assert.match(failed?.error ?? "", /no login email/i);
  assert.equal(log.batches[0].items.length, 2);
});

test("a per-email rejection from Resend is stored against that recipient, not swallowed", async () => {
  const { deps, log } = fakes({
    batchOutcome: (items) => items.map((_, i) => (i === 1 ? { error: "Invalid `to` field" } : { id: `e${i}` })),
  });
  const summary = await sendMessage(deps, message(), people(3));
  assert.equal(summary.emailFailed, 1);
  const rec = log.emailRecords.find((r) => r.accountId === "acc-1");
  assert.deepEqual({ status: rec?.status, error: rec?.error }, { status: "failed", error: "Invalid `to` field" });
});

test("when the email service throws, the message and recipients still exist and every recipient is FAILED", async () => {
  const { deps, log } = fakes({ batchOutcome: () => new Error("network down") });
  const summary = await sendMessage(deps, message(), people(3));
  assert.equal(log.messages.length, 1);
  assert.equal(log.recipients.length, 3);
  assert.equal(summary.emailFailed, 3);
  assert.equal(summary.emailSent, 0);
  assert.ok(summary.problems.length > 0, "staff are told");
  assert.ok(log.emailRecords.every((r) => r.status === "failed" && r.error));
});

test("a repeated request id sends nothing a second time", async () => {
  const { deps, log } = fakes({ duplicate: true });
  const summary = await sendMessage(deps, message(), people(3));
  assert.equal(summary.duplicate, true);
  assert.equal(summary.messageId, "existing-msg");
  assert.equal(log.batches.length, 0);
  assert.equal(log.recipients.length, 0);
});

test("push: every subscription of every recipient is tried; 404/410 ones are deleted; others stay", async () => {
  const subs: Subscription[] = [
    { id: "s1", accountId: "acc-0", endpoint: "https://p/1", p256dh: "k", auth: "a" },
    { id: "s2", accountId: "acc-0", endpoint: "https://p/2", p256dh: "k", auth: "a" },
    { id: "s3", accountId: "acc-1", endpoint: "https://p/3", p256dh: "k", auth: "a" },
    { id: "s4", accountId: "acc-9", endpoint: "https://p/4", p256dh: "k", auth: "a" }, // not a recipient
  ];
  const { deps, log } = fakes({
    subs,
    pushOutcome: (s) => ({ s1: "sent", s2: "gone", s3: "failed" })[s.id] as PushOutcome,
  });
  const summary = await sendMessage(deps, message(), people(2));
  assert.deepEqual(log.pushCalls.sort(), ["s1", "s2", "s3"]);
  assert.deepEqual(log.deleted, ["s2"]);
  assert.equal(summary.pushSent, 1);
  assert.equal(summary.pushRemoved, 1);
  assert.equal(log.pushCounts.get("acc-0"), 1);
  assert.equal(log.pushCounts.has("acc-1"), false);
});

test("push title carries URGENT: and the tap target is the message", async () => {
  let seen: { title: string; url: string } | undefined;
  const { deps } = fakes({ subs: [{ id: "s1", accountId: "acc-0", endpoint: "https://p/1", p256dh: "k", auth: "a" }] });
  deps.sendPush = async (_t, payload) => {
    seen = payload;
    return "sent";
  };
  await sendMessage(deps, message({ urgent: true }), people(1));
  assert.deepEqual(seen && { title: seen.title, url: seen.url }, { title: "URGENT: Late start", url: "/messages/msg-1" });
});

test("push disabled (no keys) is a quiet no-op: email still goes, nothing is deleted", async () => {
  const { deps, log } = fakes({
    subs: [{ id: "s1", accountId: "acc-0", endpoint: "https://p/1", p256dh: "k", auth: "a" }],
    pushOutcome: () => "disabled",
  });
  const summary = await sendMessage(deps, message(), people(1));
  assert.equal(summary.pushSent, 0);
  assert.equal(summary.emailSent, 1);
  assert.deepEqual(log.deleted, []);
  assert.deepEqual(summary.problems, []);
});

test("the real push transport returns 'disabled' without throwing when VAPID keys are unset", async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(pushConfigured(), false);
  const outcome = await sendPush(
    { endpoint: "https://push.example/e", p256dh: "k", auth: "a" },
    { title: "t", body: "b", url: "/messages/x", urgent: false }
  );
  assert.equal(outcome, "disabled");
});
