// Pins what the member-cancellation email says about HOW the money comes
// back. Owner decision 2026-09-28: a booking paid entirely by credit note
// must not show "Card refund £0.00" — it says it was paid by credit note.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingCancellationEmail } from "@/lib/emails/booking-cancellation";

const base = { offeringTitle: "MoveWell", when: "Sat 3 Oct, 10:00", participantNames: ["Sam"] };

test("a full-credit booking says credit note, never a £0 card refund", () => {
  const { html } = buildBookingCancellationEmail({ ...base, amountPence: 0, creditPence: 700 });
  assert.doesNotMatch(html, /Card refund/);
  assert.doesNotMatch(html, /£0/);
  assert.match(html, /Paid by/);
  assert.match(html, /paid for with a credit note/);
  assert.match(html, /returned to your credit/, "preheader names the credit");
  assert.match(html, /Credit returned/);
});

test("a card booking keeps its card refund row and no credit wording", () => {
  const { html } = buildBookingCancellationEmail({ ...base, amountPence: 700 });
  assert.match(html, /Card refund/);
  assert.match(html, /£7 refunded/);
  assert.doesNotMatch(html, /credit note/i);
});

test("a split booking shows both the card refund and the credit returned", () => {
  const { html } = buildBookingCancellationEmail({ ...base, amountPence: 300, creditPence: 400 });
  assert.match(html, /Card refund/);
  assert.match(html, /Credit returned/);
  assert.doesNotMatch(html, /Paid by/);
});
