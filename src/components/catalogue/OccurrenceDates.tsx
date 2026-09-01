"use client";

// The date rows for a session, collapsed to the next few.
//
// Sk8 Skool for Kidz carries 57 upcoming occurrences and the other weekly
// sessions ~28, so the full list buried everything below it — including, until
// 2026-09-01, the subscribe option, which is the one thing that makes a long
// list of dates unnecessary. Nearly everyone books one of the next few dates.
//
// Rows are formatted on the SERVER and passed in ready to render: formatting
// an occurrence means resolving Europe/London wall-clock, and doing that in
// the browser would put a second implementation next to lib/format's. This
// component only decides how many of them to show.
import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";

export type OccurrenceRow = {
  id: string;
  /** Pre-formatted by formatOccurrence() on the server. */
  when: string;
  /** Only set when the occurrence is somewhere other than the usual venue. */
  venueName: string | null;
};

const COLLAPSED_COUNT = 6;

export function OccurrenceDates({ rows }: { rows: OccurrenceRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = rows.length > COLLAPSED_COUNT;
  const visible = expanded || !collapsible ? rows : rows.slice(0, COLLAPSED_COUNT);

  return (
    <>
      <ul className="mt-4 divide-y divide-line">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="font-bold text-black">{row.when}</p>
              {row.venueName && (
                <p className="text-sm font-semibold text-muted">
                  <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  {row.venueName}
                </p>
              )}
            </div>
            <Link
              href={`/book/${row.id}`}
              className="shrink-0 rounded-full bg-blue px-5 py-3 text-sm font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
            >
              Book
            </Link>
          </li>
        ))}
      </ul>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 w-full rounded-xl border border-line py-2.5 text-sm font-extrabold text-blue transition-colors hover:border-blue"
        >
          {expanded
            ? "Show fewer dates"
            : `Show all ${rows.length} dates`}
        </button>
      )}
    </>
  );
}
