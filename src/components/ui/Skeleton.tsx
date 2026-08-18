// Loading skeletons for route-level loading.tsx boundaries.
//
// The app previously had no loading.tsx anywhere. On the App Router that
// means two things, both bad: a server navigation shows the *old* page
// until the new one is ready (so tapping a link looks like nothing
// happened), and Next cannot prefetch a dynamic route past a boundary
// that does not exist. These give every slow segment something to show
// immediately and restore prefetching.
//
// Deliberately plain CSS (`animate-pulse`) rather than a motion library:
// this is the one animation that must render before any JS has run.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-line/60 ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-card shadow-sm ${className}`}
      aria-hidden
    />
  );
}

/** Standard page shell: a title block plus a few content cards. Matches
 *  the `mx-auto max-w-* px-4 py-10 sm:px-6` main used across the app so
 *  content does not shift when the real page swaps in. */
export function PageSkeleton({
  maxWidth = "max-w-4xl",
  cards = 3,
}: {
  maxWidth?: string;
  cards?: number;
}) {
  return (
    <main
      className={`mx-auto ${maxWidth} px-4 py-10 sm:px-6`}
      // The visible skeleton is decorative; the status role is what
      // actually gets announced.
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading…</span>
      <SkeletonLine className="h-9 w-56" />
      <SkeletonLine className="mt-3 h-5 w-72" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: cards }).map((_, index) => (
          <SkeletonCard key={index} className="h-28" />
        ))}
      </div>
    </main>
  );
}
