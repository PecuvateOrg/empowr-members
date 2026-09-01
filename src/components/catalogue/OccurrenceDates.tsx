"use client";

// The date rows for a session, six at a time.
//
// A weekly session accumulates a lot of dates — Sk8 Skool for Kidz has 57
// scheduled — and rendering them as one flat list pushed everything below it
// off the screen, including the subscribe option, which is the one thing that
// makes booking date by date unnecessary.
//
// Paged rather than "show all": the page keeps the SAME height whether a
// session has 8 dates or 80, so nothing below the list moves and no session
// needs its own treatment. Paging simply stops when that session runs out.
//
// Rows are formatted on the SERVER and passed in ready to render.
// formatOccurrence resolves Europe/London wall-clock, and doing that in the
// browser would put a second implementation next to lib/format's — the trap
// lib/slot-matching.ts documents, where comparing in UTC shifts the weekday
// across the BST boundary. This component only decides which rows to show.
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

export type OccurrenceRow = {
  id: string;
  /** Pre-formatted by formatOccurrence() on the server. */
  when: string;
  /** Only set when the occurrence is somewhere other than the usual venue. */
  venueName: string | null;
};

const PAGE_SIZE = 6;

export function OccurrenceDates({ rows }: { rows: OccurrenceRow[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

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

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm font-extrabold text-blue transition-colors hover:border-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Earlier
          </button>

          {/* Announced on change so a screen reader hears which dates are now
              listed — without it, paging silently swaps the rows. */}
          <p aria-live="polite" className="text-sm font-semibold text-mid">
            {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
            {rows.length}
          </p>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="flex items-center gap-1 rounded-full border border-line px-4 py-2 text-sm font-extrabold text-blue transition-colors hover:border-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
          >
            Later <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
