// What the door needs to know about how a child leaves — resolved for one
// participant on one session date.
//
// WHY THIS EXISTS. Departure consent has been COLLECTED since 2026-08-10 (the
// booking form and the walk-in panel both ask for it) and written to Waivers'
// `departure_consents` table — but no register in this app has ever READ it.
// Staff working a Members door could see a child's name and medical notes and
// nothing about whether that child is authorised to walk home alone. The
// information existed the whole time, one table away, visible only in the
// separate waiver.empowrcic.org staff view.
//
// ⚠️ THE SAFEGUARDING RULE, and the reason this is not a one-line lookup:
// NO CONSENT FOR THIS SESSION MEANS COLLECTED IN PERSON. It does NOT mean
// "fall back to the standing default". `mem_participants.default_travel_method`
// is what a parent USUALLY does, and defaultConsentState() pre-ticks the form
// from it — so a parent who has a default and did not submit a consent has
// actively turned it off for this session. Showing the default here would tell
// staff a child may leave alone on precisely the occasion the parent declined
// to authorise it. The default is therefore never used to answer "how do they
// leave"; it is surfaced only as clearly-labelled context.
//
// ⚠️ MATCHED ON NAME, UNAVOIDABLY. departure_consents.person_id is the
// SIGNER's people.id — the parent — and siblings share it, so person_id alone
// cannot identify the child. `child_name` is free text and is the only other
// handle the schema offers. This project's rule is never to bind entities by
// name ([[feedback_entity_identifier_name_match]]), so where the name is
// ambiguous this reports `ambiguous` and refuses to guess rather than picking
// one: at a door, "check this yourself" is safe and a wrong answer is not.
//
// Pure and free of `server-only` so the rule is directly testable outside
// Next — same reasoning as lib/slot-matching.ts. The I/O half lives in
// lib/admin-data.ts.
import { isMinor } from "@/lib/age";
import { TRAVEL_METHOD_LABELS } from "@/lib/departure-consent-form";
import type { TravelMethod } from "@/lib/travel-methods";

export type DepartureConsentRecord = {
  personId: string;
  childName: string;
  travelMethod: string;
  travelMethodOther: string | null;
};

export type DepartureParticipant = {
  name: string;
  dob: string | null;
  personId: string | null;
  defaultTravelMethod: string | null;
};

export type DepartureStatus =
  /** 18 or over, or no DOB on file — a departure consent is not asked for. */
  | { kind: "not_applicable" }
  /** A consent was submitted for THIS session. `label` is the travel method. */
  | { kind: "authorised"; label: string }
  /** A minor with no consent for this session: collected in person. `usually`
   *  is the standing default where one exists, for context only — it is NOT
   *  an authorisation and must never be presented as one. */
  | { kind: "collected_in_person"; usually: string | null }
  /** Two or more consents matched this child's name under the same signer.
   *  Refuses to pick one. */
  | { kind: "ambiguous" };

/** Case- and whitespace-insensitive, because `child_name` is typed by a parent
 *  into a free-text box and "aurora pearson " must match "Aurora Pearson". */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Human label for a stored travel method, falling back to the raw value so an
 *  unrecognised one is shown rather than silently dropped — a method missing
 *  from the label map is a bug, and blanking it at a door hides a child's
 *  departure arrangement. */
export function travelMethodLabel(
  method: string,
  methodOther: string | null
): string {
  if (method === "other") return methodOther?.trim() || "Other";
  return TRAVEL_METHOD_LABELS[method as TravelMethod] ?? method;
}

/**
 * Resolve how one participant leaves this session.
 *
 * `consents` should already be narrowed to the session date by the caller —
 * this function does no date comparison, deliberately: session dates come from
 * a timestamptz that must be converted in Europe/London, and doing that in two
 * places is how this codebase has shipped the BST bug before.
 */
export function resolveDeparture(
  participant: DepartureParticipant,
  consents: DepartureConsentRecord[]
): DepartureStatus {
  // No DOB means we cannot say they are a minor, and an adult register line
  // cluttered with departure text is noise. Note this is deliberately NOT
  // "assume minor to be safe": every booking path requires a DOB, so a null
  // here is a legacy or imported row, not a child whose age is unknown.
  if (!participant.dob || !isMinor(participant.dob)) {
    return { kind: "not_applicable" };
  }

  const matches = participant.personId
    ? consents.filter(
        (c) =>
          c.personId === participant.personId &&
          sameName(c.childName, participant.name)
      )
    : [];

  if (matches.length > 1) return { kind: "ambiguous" };

  if (matches.length === 1) {
    const match = matches[0];
    return {
      kind: "authorised",
      label: travelMethodLabel(match.travelMethod, match.travelMethodOther),
    };
  }

  return {
    kind: "collected_in_person",
    usually: participant.defaultTravelMethod
      ? travelMethodLabel(participant.defaultTravelMethod, null)
      : null,
  };
}
