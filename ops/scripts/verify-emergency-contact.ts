/**
 * verify-emergency-contact.ts
 *
 * Run:
 *   npm run verify:emergency-contact
 *
 * Locks in the 2026-09-04 team safeguarding decision: an emergency contact
 * is required for EVERY skater, adults signing for themselves included.
 *
 * Why this test exists rather than just a comment: this exact rule has now
 * been changed twice in opposite directions. It was unconditional, was
 * narrowed to minors-only on 2026-08-18 (recorded as a bug fix), and was
 * widened back to everyone on 2026-09-04 after the team concluded that if
 * something happens on the floor, an adult needs a reachable contact just
 * as much as a child does. The only thing carrying that reasoning between
 * those changes was a code comment — and the second change deleted it.
 *
 * A comment cannot fail a build. This can. If someone narrows the rule back
 * to minors without re-taking the decision, the adult-only case below goes
 * red and says why, instead of the change landing silently and a member
 * turning up to a session with nobody to call.
 *
 * The alias loader is what makes this runnable at all: node strips the TS
 * types itself, but not the "@/*" path alias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { waiverSchema, participantSchema } from "@/lib/validation";

const VALID_PHONE = "07700 900123";
const UUID = "11111111-1111-4111-8111-111111111111";

const waiver = (overrides: Record<string, unknown> = {}) => ({
  participant_ids: [UUID],
  emergency_contact_name: "Alex Taylor",
  emergency_contact_phone: VALID_PHONE,
  emergency_contact_relationship: "Partner",
  agreed_tc: true,
  agreed_waiver: true,
  agreed_photo: true,
  ...overrides,
});

test("a waiver covering only an adult still requires an emergency contact", () => {
  // The 2026-08-18 behaviour: this shape was accepted, because the schema
  // left the contact blank-able and only submitWaiver() enforced it, for
  // minors. If this assertion fails, the minor-only rule is back.
  const blank = waiverSchema.safeParse(
    waiver({
      emergency_contact_name: "",
      emergency_contact_phone: "",
      emergency_contact_relationship: "",
    })
  );
  assert.equal(
    blank.success,
    false,
    "Blank emergency contact must be rejected for adults too (team decision 2026-09-04)"
  );
});

test("each emergency-contact field is individually required", () => {
  for (const field of [
    "emergency_contact_name",
    "emergency_contact_phone",
    "emergency_contact_relationship",
  ]) {
    const parsed = waiverSchema.safeParse(waiver({ [field]: "" }));
    assert.equal(parsed.success, false, `${field} must be required`);
  }
});

test("a complete emergency contact is accepted", () => {
  const parsed = waiverSchema.safeParse(waiver());
  assert.equal(parsed.success, true, "A fully completed waiver must parse");
});

test("participants cannot be saved without an emergency contact", () => {
  // Same rule at the household layer — a participant created or edited via
  // /api/participants carries the contact the waiver will later rely on.
  const base = {
    name: "Sam Taylor",
    dob: "1990-04-12",
    emergency_contact_name: "Alex Taylor",
    emergency_contact_phone: VALID_PHONE,
    medical_notes: null,
    default_travel_method: null,
  };

  assert.equal(participantSchema.safeParse(base).success, true);
  assert.equal(
    participantSchema.safeParse({ ...base, emergency_contact_name: "" }).success,
    false,
    "Participant emergency contact name must be required"
  );
  assert.equal(
    participantSchema.safeParse({ ...base, emergency_contact_phone: "" }).success,
    false,
    "Participant emergency contact phone must be required"
  );
});
