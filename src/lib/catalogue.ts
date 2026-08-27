// Catalogue reads — anon-safe queries through the cookie-free public
// client (active offerings, scheduled occurrences, venues). Server
// components only.
//
// Every database read here is wrapped in unstable_cache() under a single
// CATALOGUE_TAG. The public catalogue is read on every visit and written
// only by an admin, so serving it from cache turns the hot path from a
// transatlantic round trip into a memory lookup. Admin writes call
// revalidateCatalogue() (lib/revalidate.ts) to drop these entries; the
// revalidate window below is only a backstop in case one is ever missed.
//
// Two deliberate shapes here:
//
//  - The cached queries take no time argument and apply no time filter.
//    Baking new Date() into a cache key would either fragment the cache
//    per-request or freeze "now" into a cached row set. Instead the
//    queries fetch every scheduled row and the callers filter to future
//    ones in memory, so a cache entry stays correct however old it is.
//  - Filtering by type and age also happens in memory, over the full
//    active set, rather than as extra query variants. At single-digit
//    offering counts this is free, and it collapses what would otherwise
//    be a separate cache entry per filter combination into one.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOGUE_TAG } from "@/lib/revalidate";
import { OFFERING_TYPES, type OfferingType } from "@/lib/offering-types";
import {
  filterOfferings,
  type CatalogueFilters,
} from "@/lib/catalogue-filters";

export { OFFERING_TYPES, TYPE_LABELS, TYPE_LABELS_SINGULAR } from "@/lib/offering-types";
export type { OfferingType } from "@/lib/offering-types";

/** Backstop only — admin writes invalidate by tag immediately. */
const CATALOGUE_REVALIDATE_SECONDS = 300;

export type Venue = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
};

export type CatalogueOffering = {
  id: string;
  slug: string;
  title: string;
  type: OfferingType;
  description: string | null;
  age_min: number | null;
  age_max: number | null;
  price_pence: number;
  walk_in_price_pence: number | null;
  early_bird_price_pence: number | null;
  refund_policy: "standard" | "non_refundable";
  enrolment_scope: "per_occurrence" | "per_run";
  kit_list: string | null;
  venue: Venue | null;
};

export type CatalogueOccurrence = {
  id: string;
  course_run_id: string | null;
  starts_at: string;
  ends_at: string;
  venue: Venue | null; // override; fall back to offering venue
};

export type CatalogueCourseRun = {
  id: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  price_pence: number | null; // null = offering price
  /** Venue for this specific run. null = the offering's own venue applies.
   *  A course whose levels run at different venues (Prep to Street Skate)
   *  carries no offering venue at all and sets this on every run. */
  venue: Venue | null;
};

const OFFERING_SELECT =
  "id, slug, title, type, description, age_min, age_max, price_pence, walk_in_price_pence, early_bird_price_pence, refund_policy, enrolment_scope, kit_list, venue:mem_venues(id, name, address, postcode)";

export function isOfferingType(value: string): value is OfferingType {
  return (OFFERING_TYPES as readonly string[]).includes(value);
}

/** Every active offering, title-ordered. The one cached read behind all
 *  catalogue listing — callers filter this set rather than re-querying. */
const listActiveOfferings = unstable_cache(
  async (): Promise<CatalogueOffering[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_offerings")
      .select(OFFERING_SELECT)
      .eq("active", true)
      .order("title");

    if (error) {
      console.error("listActiveOfferings failed", error);
      return [];
    }
    return (data ?? []) as unknown as CatalogueOffering[];
  },
  ["catalogue:active-offerings"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** The type/age filter itself lives in lib/catalogue-filters.ts, which
 *  carries no "server-only" guard so the client-side filter UI on
 *  /sessions applies the identical rule. See that file before changing
 *  the semantics.
 *
 *  It was previously expressed as two chained .or() filters on the
 *  query. That was correct — PostgREST ANDs repeated `or=` parameters,
 *  verified directly against this project's REST endpoint — and the
 *  shared function reproduces the same truth table. It moved in-memory
 *  only because the filter now runs over the cached active set rather
 *  than as its own query. */
export async function listOfferings(
  filters: CatalogueFilters
): Promise<CatalogueOffering[]> {
  return filterOfferings(await listActiveOfferings(), filters);
}

const getOfferingCached = unstable_cache(
  async (slug: string): Promise<CatalogueOffering | null> => {
    const { data, error } = await createPublicClient()
      .from("mem_offerings")
      .select(OFFERING_SELECT)
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      console.error("getOffering failed", error);
      return null;
    }
    return (data as unknown as CatalogueOffering) ?? null;
  },
  ["catalogue:offering-by-slug"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** Wrapped in React cache() as well as unstable_cache(): the session
 *  detail route calls this from both generateMetadata and the page body,
 *  and this collapses those into one lookup per render. */
export const getOffering = cache(
  (slug: string): Promise<CatalogueOffering | null> => getOfferingCached(slug)
);

/** Every scheduled occurrence for an offering, soonest first — including
 *  past ones, so the cache entry does not depend on when it was built.
 *  Callers drop the past via listUpcomingOccurrences(). */
const listScheduledOccurrences = unstable_cache(
  async (offeringId: string): Promise<CatalogueOccurrence[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_occurrences")
      .select(
        "id, course_run_id, starts_at, ends_at, venue:mem_venues(id, name, address, postcode)"
      )
      .eq("offering_id", offeringId)
      .eq("status", "scheduled")
      .order("starts_at");

    if (error) {
      console.error("listScheduledOccurrences failed", error);
      return [];
    }
    return (data ?? []) as unknown as CatalogueOccurrence[];
  },
  ["catalogue:scheduled-occurrences"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);

/** Upcoming scheduled occurrences for an offering, soonest first. */
export async function listUpcomingOccurrences(
  offeringId: string,
  limit = 30
): Promise<CatalogueOccurrence[]> {
  const occurrences = await listScheduledOccurrences(offeringId);
  const now = Date.now();
  return occurrences
    .filter((o) => new Date(o.starts_at).getTime() >= now)
    .slice(0, limit);
}

export const listCourseRuns = unstable_cache(
  async (offeringId: string): Promise<CatalogueCourseRun[]> => {
    const { data, error } = await createPublicClient()
      .from("mem_course_runs")
      .select(
        "id, label, starts_on, ends_on, price_pence, venue:mem_venues(id, name, address, postcode)"
      )
      .eq("offering_id", offeringId)
      .order("starts_on", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("listCourseRuns failed", error);
      return [];
    }
    return (data ?? []) as unknown as CatalogueCourseRun[];
  },
  ["catalogue:course-runs"],
  { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_REVALIDATE_SECONDS }
);
