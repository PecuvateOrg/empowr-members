// Shared client-side shape for the per-booking departure consent
// checklist — used by both BookingForm (online) and WalkInPanel (door), so
// the two never grow their own copy of the field list or the completeness
// rule. This project has hit that exact failure three times over with
// near-identical header components (Public/Member/AdminHeader); this module
// exists so the same thing does not happen to the departure consent form.
//
// The travel-method values are NOT redeclared here — they come from
// lib/travel-methods, which is the one definition the zod schema is also
// built from. A second copy would typecheck perfectly and drift silently the
// first time a method is added.
//
// That import is deliberately NOT from lib/validation, even though it
// re-exports the same values: validation.ts builds zod schemas at module
// scope, so a value import of it from a client component pulls zod into the
// browser bundle. The type-only import below is erased at compile time and
// costs nothing.
//
// Deliberately UI-agnostic (no "use client", no JSX) so it can be imported
// by anything, including a future admin surface.
import { DEFAULT_TRAVEL_METHODS } from "@/lib/travel-methods";
import type { TravelMethod } from "@/lib/travel-methods";
import type { DepartureConsentEntry } from "@/lib/validation";

export type { TravelMethod };

export const TRAVEL_METHOD_LABELS: Record<TravelMethod, string> = {
  walk_alone: "Walks home alone",
  public_transport: "Public transport",
  meet_adult_offsite: "Meeting an adult offsite",
  with_sibling: "Leaving with a sibling",
  collected_by_other: "Collected by someone else (not the usual contact)",
  other: "Other",
};

export type DepartureConsentState = {
  enabled: boolean;
  travel_method: TravelMethod;
  travel_method_other: string;
  confirm_mature: boolean;
  confirm_knows_route: boolean;
  confirm_will_inform_staff: boolean;
  confirm_accepts_responsibility: boolean;
  confirm_understands_staff_override: boolean;
};

/** `enabled` starts true only when the participant already has a default
 *  travel method on file — the parent has told us before that this is how
 *  this person usually leaves. Everywhere else it starts off, matching the
 *  "collected in person as normal" default.
 *
 *  The stored default can only ever be one of DEFAULT_TRAVEL_METHODS
 *  (TRAVEL_METHODS minus "other"), since "other" needs free text that a
 *  standing default cannot carry — anything else falls back to walk_alone. */
export function defaultConsentState(
  defaultTravelMethod: string | null
): DepartureConsentState {
  const isKnownDefault = (DEFAULT_TRAVEL_METHODS as readonly string[]).includes(
    defaultTravelMethod ?? ""
  );
  return {
    enabled: Boolean(defaultTravelMethod) && isKnownDefault,
    travel_method: isKnownDefault
      ? (defaultTravelMethod as TravelMethod)
      : "walk_alone",
    travel_method_other: "",
    confirm_mature: false,
    confirm_knows_route: false,
    confirm_will_inform_staff: false,
    confirm_accepts_responsibility: false,
    confirm_understands_staff_override: false,
  };
}

/** True when there is nothing left to fill in before this can be submitted
 *  — vacuously true while disabled, since submitting nothing for a minor
 *  just means they are collected in person as normal. */
export function consentComplete(state: DepartureConsentState): boolean {
  if (!state.enabled) return true;
  if (state.travel_method === "other" && !state.travel_method_other.trim()) {
    return false;
  }
  return (
    state.confirm_mature &&
    state.confirm_knows_route &&
    state.confirm_will_inform_staff &&
    state.confirm_accepts_responsibility &&
    state.confirm_understands_staff_override
  );
}

/** Shape expected by POST /api/bookings and POST /api/admin/walk-ins —
 *  null unless `enabled`, since disabled just means "not applicable".
 *  Return type is the schema's own inferred type, so a change to the zod
 *  schema breaks this at compile time instead of at the API boundary. */
export function toDepartureConsentEntry(
  participantId: string,
  state: DepartureConsentState
): DepartureConsentEntry | null {
  if (!state.enabled) return null;
  return {
    participant_id: participantId,
    travel_method: state.travel_method,
    travel_method_other:
      state.travel_method === "other" ? state.travel_method_other : null,
    confirm_mature: state.confirm_mature,
    confirm_knows_route: state.confirm_knows_route,
    confirm_will_inform_staff: state.confirm_will_inform_staff,
    confirm_accepts_responsibility: state.confirm_accepts_responsibility,
    confirm_understands_staff_override: state.confirm_understands_staff_override,
  };
}
