// The canonical departure travel-method values, and nothing else.
//
// This module exists to be dependency-free. It is imported by lib/validation
// (to build the zod enum the API parses with) AND by client components via
// lib/departure-consent-form. If these values lived in lib/validation, every
// client importing them would pull zod into its bundle — validation.ts
// constructs schemas at module scope, so tree-shaking cannot drop it. That
// would put ~13kB on /book, which is the paid booking path and has had
// deliberate performance work done on it.
//
// Keeping them here means one definition, no duplication, and no zod on the
// client. Do not move them back into validation.ts, and do not re-declare
// them anywhere — a second copy typechecks perfectly and drifts the first
// time a method is added.
//
// Two arrays rather than one filtered at runtime, so both stay valid literal
// tuples for z.enum(). DEFAULT_TRAVEL_METHODS must stay TRAVEL_METHODS minus
// "other": a stored default has to stand alone, and "other" is meaningless
// without the free-text travel_method_other that describes it.
export const DEFAULT_TRAVEL_METHODS = [
  "walk_alone",
  "public_transport",
  "meet_adult_offsite",
  "with_sibling",
  "collected_by_other",
] as const;

export const TRAVEL_METHODS = [...DEFAULT_TRAVEL_METHODS, "other"] as const;

export type TravelMethod = (typeof TRAVEL_METHODS)[number];
