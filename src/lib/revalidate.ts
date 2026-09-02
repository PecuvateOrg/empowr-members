// Public catalogue refresh after an admin write.
//
// 🔴 READ THIS BEFORE ADDING ANY revalidateTag() OR revalidatePath() HERE.
//
// /sessions/[slug] sets `dynamicParams = false`. The only pages that exist in
// that segment are the ones generateStaticParams() emitted AT BUILD TIME, and
// generateStaticParams does not run again outside a build. On this stack, ANY
// on-demand invalidation of that route therefore destroys it: the prerender is
// dropped, nothing can regenerate it, and the router rejects every slug as
// unknown. All nine session pages 404 and STAY 404 until someone rebuilds.
//
// Established by experiment on 2026-09-02, on a live payment site, three times:
//
//   revalidatePath("/sessions/[slug]", "page")  -> all 9 pages die
//   revalidateTag(CATALOGUE_TAG)                -> all 9 pages die
//   time-based `revalidate = 300` on the page   -> fine, survives indefinitely
//   a cache-cleared rebuild                     -> restores every time
//
// Two fixes were shipped on the wrong theory before that was understood. The
// first removed only the revalidatePath (PR #15) and the site broke again on
// the very next admin save, because the tag alone is enough to kill it.
//
// The failure is invisible from outside: /sessions is a static page, so it
// keeps listing every session while none of them can be opened, and no build
// fails. Nobody noticed for ten hours.
//
// SO: this module no longer invalidates the catalogue at all. It rebuilds.
// A rebuild is the one mechanism observed to work every time, because it is
// the only thing that regenerates the static param set. The cost is a build
// per admin write and a delay before the change is visible; that is the
// correct trade against taking the booking funnel down.
import "server-only";
import { revalidatePath } from "next/cache";
import { triggerCatalogueRebuild } from "@/lib/rebuild";

/** Still applied to the cached catalogue reads in lib/catalogue.ts, but
 *  deliberately NEVER passed to revalidateTag() — see the header. Kept so the
 *  reads stay grouped and so a future maintainer finds this comment. */
export const CATALOGUE_TAG = "catalogue";

/**
 * Refresh the public catalogue after an admin write.
 *
 * Call this after any admin write the public catalogue can see: offerings,
 * occurrences, course runs, venues. Booking check-in does not qualify — it
 * only moves a booking's status, which the public pages never render.
 *
 * The rebuild lives in here rather than at the call sites on purpose. There
 * are eleven call sites, and this project has already shipped one outage
 * caused by a rule applied to some of them and forgotten on the rest
 * (lib/catalogue-read.ts documents that one). One function, one rule.
 *
 * @param reason short description of the write, surfaced in Netlify's deploy list
 */
export async function revalidateCatalogue(reason: string): Promise<void> {
  // Safe: /sessions is a STATIC route, so there is no build-time param set to
  // destroy. Verified to stay 200 through every incident above. This makes the
  // list itself update promptly, ahead of the rebuild landing.
  revalidatePath("/sessions", "page");

  // The actual refresh. Awaited, not fire-and-forget: a serverless function can
  // be frozen the moment it returns, which would drop the request. Never throws
  // — the admin write has already succeeded by the time this runs.
  await triggerCatalogueRebuild(reason);
}
