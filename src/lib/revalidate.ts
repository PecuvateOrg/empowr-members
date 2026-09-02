// Public catalogue cache invalidation.
//
// The catalogue is read through unstable_cache() (lib/catalogue.ts) and
// rendered by cached routes. revalidateTag() drops the data caches AND the
// cached renders that consumed them, which is enough for both public routes.
//
// 🔴 NEVER call revalidatePath() on a dynamic route PATTERN here.
//
// `revalidatePath("/sessions/[slug]", "page")` used to be the third line of
// this function and it took the entire booking funnel down, repeatedly, on
// a live payment site. /sessions/[slug] sets `dynamicParams = false`, so the
// only pages that exist are the ones generateStaticParams() emitted AT BUILD
// TIME. Revalidating the pattern discards those prerenders, generateStaticParams
// does not run again outside a build, and the router then rejects every slug as
// unknown — so all nine session pages 404 and STAY 404 until someone rebuilds.
//
// The failure was invisible from the outside: /sessions is a static page, so it
// kept listing every session while none of them could be opened. Worse, the
// edits that trigger it are the ordinary ones — shouldRebuildForOfferingChange()
// in lib/rebuild.ts deliberately does NOT rebuild for a price or copy change, so
// exactly those saves destroyed the pages with nothing to restore them. Proven
// on 2026-09-02 by a single admin save taking 9/9 pages from 200 to 404.
//
// The cost of relying on the tag alone is that a save may take up to the page's
// own `revalidate` window (300s) to appear. That is the correct trade against
// an outage.
//
// Invalidation is deliberately coarse — one tag for the whole catalogue,
// both public routes. Per-offering granularity would buy nothing at this
// data size (single-digit offerings) and every extra tag is another way
// for a write to leave a stale page behind.
//
// Call this after any admin write that the public catalogue can see:
// offerings, occurrences, course runs, venues. Booking check-in does not
// qualify — it only moves a booking's status, which the public pages
// never render.
import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

export const CATALOGUE_TAG = "catalogue";

export function revalidateCatalogue(): void {
  // Drops the unstable_cache entries and the renders that used them, for
  // both /sessions and /sessions/[slug], without touching the static param
  // set that /sessions/[slug] depends on to exist at all.
  revalidateTag(CATALOGUE_TAG);

  // Safe: /sessions is a static route, so there is no param set to destroy.
  // Do NOT add a revalidatePath for /sessions/[slug] — see the header.
  revalidatePath("/sessions", "page");
}
