// Proves the pure rules of member messaging (src/lib/message-core.ts, emails/member-message.ts,
// push-client.ts). Spec: planning/spec/member-messaging.md.
//
// What matters most here is the coach gate: a coach reaches ONE session, from the start of today to the end
// of the day seven days ahead (London calendar days, across the clocks changing), and nothing else.
import test from "node:test";
import assert from "node:assert/strict";
import {
  authoriseAudience,
  batchIdempotencyKey,
  chunk,
  coachWindow,
  describeRecipients,
  displaySubject,
  firstLine,
  firstName,
  pushPayload,
  senderIdentity,
} from "@/lib/message-core";
import { buildMemberMessageEmail } from "@/lib/emails/member-message";
import { detectPlatform, isDismissed, urlBase64ToUint8Array } from "@/lib/push-client";

const occ = { type: "occurrence", id: "11111111-1111-1111-1111-111111111111" } as const;
const NOW = new Date("2026-10-26T12:00:00Z"); // London = GMT (clocks went back 25 Oct)

test("coach window runs from the start of today to the end of day +7, London time", () => {
  const { from, until } = coachWindow(NOW);
  assert.equal(from.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(until.toISOString(), "2026-11-03T00:00:00.000Z");
});

test("coach window is right across the clocks changing (BST day, GMT end)", () => {
  const { from, until } = coachWindow(new Date("2026-10-23T10:00:00Z")); // BST: 11:00 London
  assert.equal(from.toISOString(), "2026-10-22T23:00:00.000Z", "midnight BST is 23:00Z the day before");
  assert.equal(until.toISOString(), "2026-10-31T00:00:00.000Z", "day +8 starts at midnight GMT");
});

test("coach: today (even already started), tomorrow and day +7 are allowed", () => {
  for (const startsAt of ["2026-10-26T00:30:00Z", "2026-10-26T09:00:00Z", "2026-10-27T10:00:00Z", "2026-11-02T22:00:00Z"]) {
    assert.equal(authoriseAudience("coach", occ, startsAt, NOW).ok, true, startsAt);
  }
});

test("coach: yesterday and anything from day +8 are refused", () => {
  for (const startsAt of ["2026-10-25T23:59:00Z", "2026-11-03T00:00:00Z", "2026-11-10T10:00:00Z"]) {
    const gate = authoriseAudience("coach", occ, startsAt, NOW);
    assert.equal(gate.ok, false, startsAt);
    if (!gate.ok) assert.equal(gate.status, 403);
  }
});

test("coach: offering and account audiences are refused outright; an unknown session is refused", () => {
  for (const type of ["offering", "account"] as const) {
    assert.equal(authoriseAudience("coach", { type, id: occ.id }, "2026-10-27T10:00:00Z", NOW).ok, false, type);
  }
  assert.equal(authoriseAudience("coach", occ, null, NOW).ok, false);
});

test("admin: any audience, any date", () => {
  for (const type of ["occurrence", "offering", "account"] as const) {
    assert.equal(authoriseAudience("admin", { type, id: occ.id }, "2027-03-01T10:00:00Z", NOW).ok, true, type);
  }
});

test("sender identity: coach is '<first name> at Empowr CIC', admin is 'Empowr CIC'", () => {
  const coach = senderIdentity("coach", "Sam Jones");
  assert.ok(coach.ok);
  assert.equal(coach.senderName, "Sam");
  assert.equal(coach.from, '"Sam at Empowr CIC" <bookings@empowrcic.org>');
  assert.equal(coach.signOff, "Sam, Empowr CIC");
  const admin = senderIdentity("admin", "Whoever");
  assert.ok(admin.ok);
  assert.equal(admin.senderName, "Empowr CIC");
  assert.equal(admin.from, '"Empowr CIC" <bookings@empowrcic.org>');
  assert.equal(admin.signOff, null);
});

test("a coach with no usable name cannot send", () => {
  for (const name of [null, undefined, "", "   ", "Deleted member", '"<>']) {
    assert.equal(senderIdentity("coach", name).ok, false, String(name));
  }
});

test("a coach's name cannot break out of the From header", () => {
  const id = senderIdentity("coach", 'Sam"> <evil@example.com> Bcc: x');
  assert.ok(id.ok);
  assert.doesNotMatch(id.from, /evil|Bcc|[\r\n]/);
  assert.match(id.from, /^"[^"<>,]+ at Empowr CIC" <bookings@empowrcic.org>$/);
  assert.equal(firstName("Zoë  O'Neil"), "Zoë");
});

test("urgent adds URGENT: to the subject and the push title only", () => {
  assert.equal(displaySubject("Late start", true), "URGENT: Late start");
  assert.equal(displaySubject("Late start", false), "Late start");
  const p = pushPayload({ id: "abc", subject: "Late start", body: "\n\nWe start at 11.\nBring pads.", urgent: true });
  assert.deepEqual(p, { title: "URGENT: Late start", body: "We start at 11.", url: "/messages/abc", urgent: true });
});

test("push body is the first line, shortened", () => {
  const long = "x".repeat(300);
  assert.ok(firstLine(long).length <= 140);
  assert.ok(firstLine(long).endsWith("…"));
});

test("recipient summary reads '6 families, 7 children'", () => {
  const r = (n: number, kids: string[]) => ({ accountId: `a${n}`, accountName: `P${n}`, participantNames: kids });
  const people = [r(1, ["A", "B"]), r(2, ["A"]), r(3, ["C"]), r(4, ["D"]), r(5, ["E"]), r(6, ["F"])];
  assert.equal(describeRecipients(people, "occurrence"), "6 families, 7 children");
  assert.equal(describeRecipients([r(1, ["A"])], "occurrence"), "1 family, 1 child");
  assert.equal(describeRecipients([r(1, [])], "account"), "1 member");
});

test("batching: 250 emails make three calls and the first key is the bare message id", () => {
  assert.deepEqual(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length), [100, 100, 50]);
  assert.equal(batchIdempotencyKey("m1", 0), "m1");
  assert.equal(batchIdempotencyKey("m1", 2), "m1-2");
});

test("the email is exactly what staff wrote, escaped, with a fixed footer and a link", () => {
  const e = buildMemberMessageEmail({
    subject: "Late start",
    body: "We start at 11.\n<script>alert(1)</script>\n\nSecond paragraph",
    urgent: true,
    signOff: "Sam, Empowr CIC",
    audienceLabel: "Roller Quad Camp - Mon 26 Oct 2026, 10:30am-3pm",
    participantNames: ["Ava", "Ben"],
    messageUrl: "https://members.empowrcic.org/messages/abc",
  });
  assert.equal(e.subject, "URGENT: Late start");
  assert.doesNotMatch(e.html, /<script>/);
  assert.match(e.html, /&lt;script&gt;/);
  assert.match(e.html, /Roller Quad Camp/);
  assert.match(e.html, /Ava, Ben/);
  assert.match(e.html, /Sam, Empowr CIC/);
  assert.match(e.html, /href="https:\/\/members.empowrcic.org\/messages\/abc"/);
  assert.match(e.text, /View in your account: https:\/\/members.empowrcic.org\/messages\/abc/);
});

test("install banner: dismissed for 30 days, then back; bad stored values never hide it for ever", () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 9, 26);
  assert.equal(isDismissed(null, now), false);
  assert.equal(isDismissed(now - 29 * day, now), true);
  assert.equal(isDismissed(now - 31 * day, now), false);
  assert.equal(isDismissed(Number.NaN, now), false);
  assert.equal(isDismissed(now + 5 * day, now), false, "a timestamp from the future is ignored");
});

test("platform detection: iPhone and iPad (incl. iPadOS posing as a Mac) get the Share tip; installed is standalone", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const ipados = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
  assert.equal(detectPlatform(iphone, 5, false), "ios-browser");
  assert.equal(detectPlatform(ipados, 5, false), "ios-browser");
  assert.equal(detectPlatform(ipados, 0, false), "other", "a real Mac");
  assert.equal(detectPlatform(android, 5, false), "other");
  assert.equal(detectPlatform(iphone, 5, true), "standalone");
});

test("the VAPID public key decodes to the 65 bytes of an uncompressed P-256 point", () => {
  const key = "BHlGOUXGUOvitctkEusT4brjb_Npf9tJPuTvyxqJhhDRR60DrAvUvrfm14PR_jn8oI0kVKPIF3WuialH7jbrNpw";
  const bytes = urlBase64ToUint8Array(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
});
