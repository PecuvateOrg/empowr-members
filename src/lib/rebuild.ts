// Netlify production rebuild trigger.
//
// WHY THIS EXISTS
// /sessions/[slug] sets `dynamicParams = false`, which is the only thing that
// makes an unknown or inactive slug return a real 404 instead of a cached 200
// (see that file for the full finding). The cost of that setting is that the
// set of session pages is fixed at build time by generateStaticParams().
//
// revalidateCatalogue() cannot cover the gap: revalidation re-renders params
// that already exist, it never adds new ones. So an offering that becomes
// active after the build would be LISTED on /sessions and 404 when clicked —
// a broken link on a live page, which is worse than the soft-404 the
// dynamicParams change fixed. This closes that gap by rebuilding the site
// whenever the set of active slugs actually changes.
//
// DELIBERATELY NARROW. Only three writes change that set: creating an active
// offering, flipping `active`, and renaming an active offering's slug. A price
// or description edit does not, and must not trigger a build — during one
// pricing pass on 2026-08-28 that would have rebuilt the site four times over.
// shouldRebuildForOfferingChange() below is where that judgement lives, so the
// routes stay readable and the rule is stated once.
//
// FAILURE MODEL: never throws, never blocks. The admin write has already
// succeeded by the time this runs; a failed build trigger must not turn a
// successful save into an error. An unset env var is a silent no-op, which is
// exactly what local development and deploy previews get — a preview must
// never be able to trigger a production build.
import "server-only";

/** Fire the Netlify build hook. Awaited rather than fire-and-forget: a
 *  serverless function can be frozen the moment it returns, which would drop
 *  an un-awaited request. Bounded so a slow Netlify can't hold up an admin
 *  save. */
export async function triggerCatalogueRebuild(reason: string): Promise<void> {
  const hook = process.env.NETLIFY_CATALOGUE_BUILD_HOOK;
  if (!hook) {
    // Expected locally and on deploy previews — say so once, quietly, rather
    // than looking like a misconfiguration in production logs.
    console.info("catalogue rebuild skipped (no build hook configured):", reason);
    return;
  }

  try {
    const res = await fetch(hook, {
      method: "POST",
      // Netlify surfaces this in the deploy list, so the deploy itself
      // explains why it happened.
      body: JSON.stringify({ trigger_title: `Catalogue: ${reason}` }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("catalogue rebuild trigger failed", res.status, reason);
      return;
    }
    console.info("catalogue rebuild triggered:", reason);
  } catch (error) {
    console.error("catalogue rebuild trigger threw", reason, error);
  }
}

type OfferingSlugState = { slug: string; active: boolean };

/** Does this offering change alter the set of slugs generateStaticParams()
 *  returns? That set is the active offerings' slugs and nothing else, so:
 *
 *  - active flipped either way        -> yes (a page appears or disappears)
 *  - an ACTIVE offering was renamed   -> yes (one slug replaces another)
 *  - an inactive offering was renamed -> no  (it is in neither set)
 *  - anything else (price, copy, age) -> no
 */
export function shouldRebuildForOfferingChange(
  before: OfferingSlugState,
  after: OfferingSlugState
): boolean {
  if (before.active !== after.active) return true;
  return after.active && before.slug !== after.slug;
}
