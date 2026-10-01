// How an emergency contact is related to the skater. One list for the
// in-app waiver, the household form and the standalone waiver form
// (Empowr-Waivers StepSkating.tsx keeps an identical copy — change both
// together, so the two surfaces record comparable values).
//
// Dependency-free so client components can import it without pulling zod
// into the browser bundle (same reason as lib/travel-methods).
//
// Partner / Spouse, Son / Daughter and Other relative added 2026-10-01: the
// original list only fitted a child's contact, so adult skaters fell back to
// "Other" — 50 of 137 waivers at the time. There is deliberately no "Self":
// the contact must be someone other than the skater.
export const EC_RELATIONSHIPS = [
  "Parent",
  "Guardian",
  "Partner / Spouse",
  "Son / Daughter",
  "Grandparent",
  "Sibling",
  "Other relative",
  "Carer",
  "Coach",
  "Friend",
  "Other",
] as const;

export type EcRelationship = (typeof EC_RELATIONSHIPS)[number];

/** Shown under every relationship picker. Says "not the skater", never
 *  "not you": a parent signing for their child IS the right contact. */
export const EC_RELATIONSHIP_HINT =
  "The person we call if something happens — someone other than the skater.";
