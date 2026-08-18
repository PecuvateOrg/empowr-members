// Public catalogue cache invalidation.
//
// The catalogue is read through unstable_cache() (lib/catalogue.ts) and
// rendered by cached routes, so an admin write is invisible to the public
// site until both layers are dropped: revalidateTag() clears the data
// caches, revalidatePath() clears the rendered pages. Doing only one
// leaves the other serving the old catalogue.
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
  revalidateTag(CATALOGUE_TAG);
  revalidatePath("/sessions", "page");
  revalidatePath("/sessions/[slug]", "page");
}
