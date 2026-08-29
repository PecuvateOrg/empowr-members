/**
 * verify-departure-consent.ts
 *
 * Run:
 *   npm run verify:departure-consent
 *
 * Tests the seam between the CLIENT builder and the SERVER schema for
 * per-booking departure consent: does what BookingForm and WalkInPanel
 * actually send survive the zod parse that POST /api/bookings and
 * POST /api/admin/walk-ins run on it?
 *
 * Why this test and not a broader one: both forms build their payload with
 * toDepartureConsentEntry(), and both routes parse it with
 * departureConsentEntrySchema. Those two are in different files, neither
 * imports the other's expectations, and a mismatch typechecks perfectly
 * because the route parses `unknown` off the wire. A silent failure here
 * looks like a booking that succeeds while the safeguarding record it was
 * meant to carry is quietly dropped by a 400 nobody reads — which is the
 * worst possible way for this particular feature to fail.
 *
 * The alias loader is what makes this runnable at all: node strips the TS
 * types itself, but not the "@/*" path alias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultConsentState,
  consentComplete,
  toDepartureConsentEntry,
  type DepartureConsentState,
} from "@/lib/departure-consent-form";
import { departureConsentEntrySchema } from "@/lib/validation";
import { DEFAULT_TRAVEL_METHODS, TRAVEL_METHODS } from "@/lib/travel-methods";

const PARTICIPANT = "00000000-0000-4000-8000-000000000001";

/** A fully affirmed checklist — what a parent who says yes produces. */
function affirmed(over: Partial<DepartureConsentState> = {}): DepartureConsentState {
  return {
    ...defaultConsentState(null),
    enabled: true,
    confirm_mature: true,
    confirm_knows_route: true,
    confirm_will_inform_staff: true,
    confirm_accepts_responsibility: true,
    confirm_understands_staff_override: true,
    ...over,
  };
}

test("disabled consent produces nothing to send", () => {
  const state = defaultConsentState(null);
  assert.equal(state.enabled, false, "must default to collected-in-person");
  assert.equal(toDepartureConsentEntry(PARTICIPANT, state), null);
  // Vacuously complete: not answering is a valid, and the common, outcome.
  assert.equal(consentComplete(state), true);
});

test("every travel method the schema accepts round-trips from the builder", () => {
  for (const method of TRAVEL_METHODS) {
    const state = affirmed({
      travel_method: method,
      // "other" is the one method that carries free text, and the schema
      // rejects it without.
      travel_method_other: method === "other" ? "Picked up by their aunt" : "",
    });
    assert.equal(consentComplete(state), true, `${method} should be complete`);

    const entry = toDepartureConsentEntry(PARTICIPANT, state);
    assert.notEqual(entry, null, `${method} should produce an entry`);

    const parsed = departureConsentEntrySchema.safeParse(entry);
    assert.equal(
      parsed.success,
      true,
      `${method} rejected by the server schema: ${
        parsed.success ? "" : JSON.stringify(parsed.error.issues)
      }`
    );
  }
});

test('"other" without a description is refused by BOTH sides', () => {
  const state = affirmed({ travel_method: "other", travel_method_other: "   " });

  // The form must not offer to submit it...
  assert.equal(consentComplete(state), false);

  // ...and the schema must reject it even if something bypassed the form,
  // since travel_method_other is what the record actually means here.
  const entry = toDepartureConsentEntry(PARTICIPANT, state);
  assert.equal(departureConsentEntrySchema.safeParse(entry).success, false);
});

test("an unfinished checklist is refused by both sides", () => {
  for (const key of [
    "confirm_mature",
    "confirm_knows_route",
    "confirm_will_inform_staff",
    "confirm_accepts_responsibility",
    "confirm_understands_staff_override",
  ] as const) {
    const state = affirmed({ [key]: false });
    assert.equal(consentComplete(state), false, `${key} unticked must block`);

    const entry = toDepartureConsentEntry(PARTICIPANT, state);
    assert.equal(
      departureConsentEntrySchema.safeParse(entry).success,
      false,
      `${key} unticked must be rejected server-side too`
    );
  }
});

test("a stored travel-method default pre-fills but never pre-consents", () => {
  for (const method of DEFAULT_TRAVEL_METHODS) {
    const state = defaultConsentState(method);
    assert.equal(state.travel_method, method, "should pre-fill the method");
    // The whole point of per-booking consent: a standing preference is not
    // an answer to "is it ok tonight?". The checklist must start blank, so
    // the state must not be submittable without someone ticking it.
    assert.equal(
      consentComplete(state),
      false,
      `${method} must not arrive pre-consented`
    );
  }
});

test("an unrecognised stored default does not silently become walk_alone consent", () => {
  // A value outside DEFAULT_TRAVEL_METHODS should not leave the toggle on
  // with a fabricated method underneath it.
  const state = defaultConsentState("teleporter");
  assert.equal(state.enabled, false);
  assert.equal(toDepartureConsentEntry(PARTICIPANT, state), null);
});
