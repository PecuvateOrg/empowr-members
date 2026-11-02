import { test } from "node:test";
import assert from "node:assert/strict";
import { offerCheckoutExpiry, privateOfferSchema, offerTokenSchema } from "../../src/lib/private-offers.ts";
import { equipmentDeadline } from "../../src/lib/private-bookings.ts";
import { buildPrivateBookingConfirmationEmail } from "../../src/lib/emails/private-booking.ts";

test("offer checkout never outlives the 48-hour deadline or party start", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(offerCheckoutExpiry("2026-11-04T12:00:00Z", "2026-11-07T15:00:00Z", now), now / 1000 + 31 * 60);
  assert.equal(offerCheckoutExpiry("2026-11-02T12:30:59Z", "2026-11-07T15:00:00Z", now), null);
  assert.equal(offerCheckoutExpiry("2026-11-04T12:00:00Z", "2026-11-02T12:30:00Z", now), null);
  assert.equal(offerCheckoutExpiry("2026-11-02T12:31:00Z", "2026-11-07T15:00:00Z", now), now / 1000 + 31 * 60);
  assert.equal(offerCheckoutExpiry("invalid", "2026-11-07T15:00:00Z", now), null);
});
test("ordinary bookings retain two weeks, offers use one week including a DST boundary", () => {
  assert.equal(equipmentDeadline("2026-11-07T15:00:00Z"), "Sat 24 Oct 2026");
  assert.equal(equipmentDeadline("2026-11-07T15:00:00Z", 7), "Sat 31 Oct 2026");
  assert.equal(equipmentDeadline("2026-10-31T15:00:00Z", 7), "Sat 24 Oct 2026");
});
test("offer input rejects invalid dates, fractional counts and malformed capabilities", () => {
  assert.equal(privateOfferSchema.safeParse({ starts_at: "2026-11-07T15:00:00Z", paid_places: 10 }).success, true);
  for (const paid_places of [0, -1, 10.5, 201]) assert.equal(privateOfferSchema.safeParse({ starts_at: "2026-11-07T15:00:00Z", paid_places }).success, false);
  assert.equal(offerTokenSchema.safeParse("a".repeat(64)).success, true);
  assert.equal(offerTokenSchema.safeParse("a".repeat(63)).success, false);
});
test("late-offer confirmation tells the host to arrange hire, without a contradictory two-week deadline", () => {
  const { html } = buildPrivateBookingConfirmationEmail({ hostName: "Test", kindLabel: "Birthday party", when: "Saturday", venue: null,
    isBirthday: true, paidPlaces: 10, totalPlaces: 11, skaters: [], amountPence: 20000, paidOnline: true,
    manageUrl: "https://example.test/manage", inviteUrl: "https://example.test/join", equipmentDeadline: "Sat 31 Oct 2026", lateHire: true });
  assert.match(html, /Sat 31 Oct 2026/);
  assert.match(html, /contact Empowr to arrange skate hire/);
  assert.doesNotMatch(html, /two weeks/);
});
