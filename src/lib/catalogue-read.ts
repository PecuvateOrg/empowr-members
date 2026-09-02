// The error policy for every catalogue read, kept in its own module.
//
// This carries NO "server-only" guard, for the same reason lib/age.ts does
// not: catalogue.ts is server-only and cannot be imported by a test outside
// Next, so the rule that matters would be untestable if it lived there.
//
// WHY THIS EXISTS AT ALL. On 2026-09-01 three of the four catalogue reads
// were changed to throw instead of returning an empty value, because a
// swallowed error is indistinguishable from a legitimately empty result once
// a page acts on it. `getOffering` was missed. On 2026-09-02 that took every
// /sessions/[slug] page down: a failed read returned null, the page read null
// as "inactive offering" and called notFound(), and ISR cached the 404.
// /sessions stayed up throughout, because it reads listActiveOfferings, which
// throws — so Next served the last good page. The catalogue looked healthy
// while every booking page on a live payment site was dead, and only a
// cache-cleared rebuild brought them back.
//
// Failing loudly PRESERVES content: Next serves the last good page when a
// revalidation throws. Failing quietly REPLACES good content with a claim
// that is false — "no sessions", "no dates yet", or a 404 on a session that
// is running and selling. Route every new catalogue read through this so the
// rule cannot be applied to some reads and forgotten on others.

/** Postgrest-shaped error — only the message is used, so this stays free of
 *  any Supabase type import and the module has no dependencies at all. */
export type ReadError = { message: string };

export function unwrap<T>(
  label: string,
  data: T,
  error: ReadError | null | undefined
): T {
  if (error) {
    console.error(`${label} failed`, error);
    throw new Error(`${label} failed: ${error.message}`);
  }
  return data;
}
