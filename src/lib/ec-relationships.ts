// How an emergency contact is related to the skater. One list for the
// in-app waiver and the household form; the standalone waiver form
// (Empowr-Waivers StepSkating.tsx) keeps an identical copy — change both
// together, so the two surfaces record comparable values.
//
// Dependency-free so client components can import it without pulling zod
// into the browser bundle (same reason as lib/travel-methods).
//
// 2026-10-01: the original list only fitted a child's contact, so adult
// skaters fell back to "Other" — 50 of 137 waivers. Reworked into a short
// list with Partner / Spouse and Son / Daughter, and "Other" now needs a
// description. Values stored before then (Grandparent, Sibling, Coach, bare
// "Other") stay as recorded. There is deliberately no "Self": the contact
// must be someone other than the skater.
export const EC_RELATIONSHIPS = [
  "Parent / Guardian",
  "Partner / Spouse",
  "Son / Daughter",
  "Other family member",
  "Carer",
  "Friend",
  "Other",
] as const;

export type EcRelationship = (typeof EC_RELATIONSHIPS)[number];

/** Shown under every relationship picker. Says "not the skater", never
 *  "not you": a parent signing for their child IS the right contact. */
export const EC_RELATIONSHIP_HINT =
  "The person we call if something happens — someone other than the skater.";

const OTHER_PREFIX = "Other: ";

/** The stored value: the choice, or "Other: <description>". */
export function composeRelationship(choice: string, other?: string | null): string {
  return choice === "Other" ? `${OTHER_PREFIX}${(other ?? "").trim()}` : choice;
}

/** Back into form fields. A stored value not on the current list (an older
 *  option, or anything unexpected) comes back blank so the form asks again. */
export function splitRelationship(stored: string | null): {
  choice: EcRelationship | "";
  other: string;
} {
  if (!stored) return { choice: "", other: "" };
  if (stored.startsWith(OTHER_PREFIX)) {
    return { choice: "Other", other: stored.slice(OTHER_PREFIX.length) };
  }
  return (EC_RELATIONSHIPS as readonly string[]).includes(stored) && stored !== "Other"
    ? { choice: stored as EcRelationship, other: "" }
    : { choice: "", other: "" };
}

/** Compares names loosely enough to catch "Sam Taylor" vs " sam  taylor ". */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) !== "" && norm(a) === norm(b);
}
