// What the door is told about who to ring if something happens.
//
// A blank cell is the wrong answer here. On 2026-09-07 EIGHT of 49
// participants had no emergency contact at all and FOUR live future bookings
// belonged to them — so this is not a hypothetical gap, it is what staff will
// meet at the next session. Rendering an empty column would read as "nothing
// to see", which is indistinguishable from a field that failed to load. The
// door has to be told the difference between "here is the number" and "there
// is no number".
//
// CONTACT-IS-SELF IS ITS OWN STATE, and the reason is [[feedback_emergency_
// contact_never_self]]: participants have been recorded as their own emergency
// contact before (one still is). That is worse than a blank, because it LOOKS
// answered — staff would see a name and a number and only discover at the
// moment it matters that they are ringing the person lying on the floor. The
// schema requires a contact for everyone (verify-emergency-contact.ts pins
// that decision) but cannot require it to be somebody else.
//
// Pure and free of `server-only` so the rule is testable outside Next — same
// reasoning as lib/slot-matching.ts and lib/register-departure.ts.

export type EmergencyContactStatus =
  /** Name and a reachable number. */
  | { kind: "ok"; name: string; phone: string }
  /** A name, but no number to ring. */
  | { kind: "no_phone"; name: string }
  /** The contact names the participant themselves — present but useless. */
  | { kind: "self"; phone: string | null }
  /** Nothing on file. */
  | { kind: "missing" };

const blank = (value: string | null | undefined): boolean =>
  !value || value.trim() === "";

/** Same normalisation as the departure name match — a contact typed as
 *  "  freya stern " is still the participant. */
const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function resolveEmergencyContact(participant: {
  name: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}): EmergencyContactStatus {
  const { emergencyContactName: contactName, emergencyContactPhone: phone } =
    participant;

  if (blank(contactName)) return { kind: "missing" };

  // Checked BEFORE the phone, deliberately: a self-reference with a valid
  // number is the dangerous case, and reporting it as "ok" because a number
  // is present is exactly the trap this state exists to close.
  if (sameName(contactName as string, participant.name)) {
    return { kind: "self", phone: blank(phone) ? null : (phone as string) };
  }

  if (blank(phone)) return { kind: "no_phone", name: (contactName as string).trim() };

  return {
    kind: "ok",
    name: (contactName as string).trim(),
    phone: (phone as string).trim(),
  };
}

/** A `tel:` href — strips spaces and punctuation a parent typed, keeping a
 *  leading "+". Returns null when there is nothing dialable, so the caller
 *  renders plain text rather than a dead link. */
export function telHref(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  // A UK number is 10-11 digits; allow a little either side for international
  // forms, but refuse to build a link out of something that cannot be a
  // number at all.
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${cleaned}`;
}
