// Catalogue filter rules — deliberately NOT server-only.
//
// The same type/age filter now runs in two places: server-side in
// lib/catalogue.ts (over the cached active set) and client-side in
// components/catalogue/SessionsCatalogue.tsx (so tapping a filter chip
// is instant instead of a server round trip). Both import from here so
// the rule exists once. Do not inline a copy into either caller — a
// duplicated filter is exactly the kind of thing that drifts silently
// and then disagrees between the two renders of the same list.
//
// Typed structurally rather than against CatalogueOffering so this
// module never has to import the server-only catalogue module.
import type { OfferingType } from "@/lib/offering-types";

export type FilterableOffering = {
  type: OfferingType;
  age_min: number | null;
  age_max: number | null;
};

export type CatalogueFilters = {
  type?: OfferingType;
  age?: number;
};

/** An offering is age-eligible when the requested age falls inside its
 *  bounds, with a null bound meaning "open-ended that side". */
export function matchesAge(offering: FilterableOffering, age: number): boolean {
  const aboveMin = offering.age_min === null || offering.age_min <= age;
  const belowMax = offering.age_max === null || offering.age_max >= age;
  return aboveMin && belowMax;
}

export function filterOfferings<T extends FilterableOffering>(
  offerings: T[],
  filters: CatalogueFilters
): T[] {
  return offerings.filter((offering) => {
    if (filters.type && offering.type !== filters.type) return false;
    if (filters.age !== undefined && !matchesAge(offering, filters.age)) {
      return false;
    }
    return true;
  });
}

/** Shared by the server route and the client filter UI so a typed age
 *  is validated identically wherever it arrives from. */
export function parseAge(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 120
    ? parsed
    : undefined;
}
