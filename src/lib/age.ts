// Age eligibility derives from DOB — never store age, always compute.
import { differenceInYears, isValid, parseISO } from "date-fns";

/** Whole years old on a given date (defaults to today). */
export function ageOn(dob: string | Date, on: Date = new Date()): number {
  const date = typeof dob === "string" ? parseISO(dob) : dob;
  return differenceInYears(on, date);
}

/** Age-range eligibility check — null bounds are open-ended. */
export function isAgeEligible(
  dob: string | Date,
  ageMin: number | null,
  ageMax: number | null,
  on: Date = new Date()
): boolean {
  const age = ageOn(dob, on);
  if (ageMin !== null && age < ageMin) return false;
  if (ageMax !== null && age > ageMax) return false;
  return true;
}

/** DOB sanity: a real date, not in the future, not >120 years ago. */
export function isPlausibleDob(dob: string): boolean {
  const date = parseISO(dob);
  if (!isValid(date)) return false;
  const now = new Date();
  return date <= now && differenceInYears(now, date) <= 120;
}

export type OfferingAgeBounds = { age_min: number | null; age_max: number | null };

/**
 * Is this DOB inside ANY of a plan's entitled offerings' age ranges?
 *
 * Pure and free of `server-only` so it is directly testable outside Next —
 * same reasoning as lib/slot-matching.ts. The I/O half (reading the bounds
 * for a plan) stays in lib/membership.ts.
 *
 * No bounds at all means unrestricted, which is how an offering with null
 * age_min/age_max already behaves everywhere else.
 */
export function ageEligibleForPlan(
  dob: string,
  bounds: OfferingAgeBounds[],
  on: Date = new Date()
): boolean {
  if (bounds.length === 0) return true;
  return bounds.some((b) => isAgeEligible(dob, b.age_min, b.age_max, on));
}
