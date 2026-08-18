import Link from "next/link";
import type { Metadata } from "next";
import {
  OFFERING_TYPES,
  TYPE_LABELS,
  isOfferingType,
  listOfferings,
  type OfferingType,
} from "@/lib/catalogue";
import { OfferingCard } from "@/components/catalogue/OfferingCard";

export const metadata: Metadata = {
  title: "Sessions — Empowr Members",
  description:
    "Browse and book Empowr CIC skating sessions — drop-ins, lessons, courses, camps and events.",
};

// No force-dynamic. Reading searchParams already makes this route render
// per request, and force-dynamic additionally stamped the response
// no-store. What actually cost time was the database round trip, and that
// is now served from the catalogue cache — the filters are applied in
// memory over the cached active set.

function filterHref(type?: OfferingType, age?: string) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (age) params.set("age", age);
  const qs = params.toString();
  return qs ? `/sessions?${qs}` : "/sessions";
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; age?: string }>;
}) {
  const params = await searchParams;
  const type =
    params.type && isOfferingType(params.type) ? params.type : undefined;
  const parsedAge = params.age ? Number.parseInt(params.age, 10) : NaN;
  const age =
    Number.isInteger(parsedAge) && parsedAge >= 0 && parsedAge <= 120
      ? parsedAge
      : undefined;

  const offerings = await listOfferings({ type, age });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-black tracking-tight text-black">
        Sessions
      </h1>
      <p className="mt-1 max-w-xl text-mid">
        Skating for every age and level — drop in, learn with our coaches, or
        join a course.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href={filterHref(undefined, params.age)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
            !type
              ? "bg-blue text-white"
              : "bg-card text-mid hover:text-blue"
          }`}
        >
          All
        </Link>
        {OFFERING_TYPES.map((value) => (
          <Link
            key={value}
            href={filterHref(value, params.age)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              type === value
                ? "bg-blue text-white"
                : "bg-card text-mid hover:text-blue"
            }`}
          >
            {TYPE_LABELS[value]}
          </Link>
        ))}
        <form action="/sessions" className="ml-auto flex items-center gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <label
            htmlFor="age-filter"
            className="text-sm font-bold text-mid"
          >
            Age
          </label>
          <input
            id="age-filter"
            name="age"
            type="number"
            min={0}
            max={120}
            defaultValue={age}
            placeholder="any"
            className="w-20 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold text-black focus:border-blue focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-blue px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-blue-dark"
          >
            Go
          </button>
        </form>
      </div>

      {offerings.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-card p-8 text-center font-semibold text-mid shadow-sm">
          {type || age !== undefined
            ? "No sessions match those filters — try widening them."
            : "Our session timetable is being finalised — check back soon."}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {offerings.map((offering) => (
            <OfferingCard key={offering.id} offering={offering} />
          ))}
        </div>
      )}
    </main>
  );
}
