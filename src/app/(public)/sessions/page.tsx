import { Suspense } from "react";
import type { Metadata } from "next";
import { listOfferings } from "@/lib/catalogue";
import { SessionsCatalogue } from "@/components/catalogue/SessionsCatalogue";

export const metadata: Metadata = {
  title: "Sessions — Empowr Members",
  description:
    "Browse and book Empowr CIC skating sessions — drop-ins, lessons, courses, camps and events.",
};

// Static, and revalidated the same way as /sessions/[slug]. This route
// used to read searchParams for the type/age filters, which forced a
// per-request render and made it uncacheable no matter what the data
// layer did — session 3 measured that as its hard floor at 274ms.
// Filtering moved into SessionsCatalogue on the client, so the page
// itself now has no per-request input and serves from the CDN.
//
// Admin writes drop this immediately via revalidateCatalogue(); the
// window below is only the backstop.
export const revalidate = 300;

export default async function SessionsPage() {
  // The whole active set — the client filters it. Single-digit rows.
  const offerings = await listOfferings({});

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight text-black">
        Sessions
      </h1>
      <p className="mt-1 max-w-xl text-mid">
        Skating for every age and level — drop in, learn with our coaches, or
        join a course.
      </p>

      {/* SessionsCatalogue reads useSearchParams for its initial filter
          state, which has to sit behind a Suspense boundary for this page
          to prerender. */}
      <Suspense fallback={<CatalogueFallback />}>
        <SessionsCatalogue offerings={offerings} />
      </Suspense>
    </main>
  );
}

/** Matches the real filter row's height so the page does not jump when
 *  the catalogue hydrates. */
function CatalogueFallback() {
  return (
    <div className="mt-6" aria-hidden>
      <div className="flex flex-wrap gap-2">
        {[68, 96, 92, 92, 84, 84].map((width, index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded-full bg-card"
            style={{ width }}
          />
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-card" />
        <div className="h-48 animate-pulse rounded-2xl bg-card" />
      </div>
    </div>
  );
}
