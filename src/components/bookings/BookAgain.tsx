import Link from "next/link";
import { Repeat } from "lucide-react";
import type { BookAgainItem } from "@/lib/book-again";

/** Sessions the member has booked before, most-booked first, each with its
 *  next date the skater is not already booked on. Renders nothing for a
 *  member with no booking history. */
export function BookAgain({ items }: { items: BookAgainItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-black">
        <Repeat className="h-5 w-5 text-blue" aria-hidden /> Book again
      </h2>
      <ul className="mt-3 divide-y divide-line">
        {items.map((item) => (
          <li
            key={`${item.slug}|${item.participantName}`}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="font-bold text-black">{item.title}</p>
              <p className="text-sm text-mid">
                {item.participantName && <>{item.participantName} · </>}
                booked {item.timesBooked === 1 ? "once" : `${item.timesBooked} times`}
              </p>
              <p className="text-sm font-semibold text-black">
                {item.nextDate ? `Next: ${item.nextDate}` : "See dates on the session page"}
              </p>
            </div>
            <Link
              href={`/sessions/${item.slug}`}
              className="inline-flex shrink-0 rounded-full bg-blue px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-blue-dark"
            >
              {item.nextDate ? "Book" : "See dates"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
