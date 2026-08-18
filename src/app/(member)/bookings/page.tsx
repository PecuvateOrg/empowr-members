// My Bookings — upcoming/past. Read is RLS-scoped (own rows only). There
// is no self-serve cancellation yet, and confirmed bookings show no
// cancel/transfer messaging at all — see the note in BookingsList.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import { formatOccurrence, formatDate } from "@/lib/format";
import { BookingsList, type BookingView } from "@/components/bookings/BookingsList";

export const metadata: Metadata = { title: "Your bookings — Empowr Members" };
export const dynamic = "force-dynamic";

type OfferingJoin = { title: string };

type BookingRow = {
  id: string;
  status: string;
  price_paid_pence: number | null;
  created_at: string;
  participant: { name: string } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    offering: OfferingJoin | null;
  } | null;
  course_run: {
    label: string;
    starts_on: string | null;
    ends_on: string | null;
    offering: OfferingJoin | null;
  } | null;
};

/** A course-run "when" line: label, plus a date range when both bounds
 *  are known — mirrors lib/notifications.ts courseRunWhen. */
function courseRunWhen(run: {
  label: string;
  starts_on: string | null;
  ends_on: string | null;
}): string {
  if (run.starts_on && run.ends_on) {
    return `${run.label} (${formatDate(run.starts_on)} – ${formatDate(run.ends_on)})`;
  }
  return run.label;
}

export default async function BookingsPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("mem_bookings")
    .select(
      `id, status, price_paid_pence, created_at,
       participant:mem_participants(name),
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title)),
       course_run:mem_course_runs(label, starts_on, ends_on, offering:mem_offerings(title))`
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as BookingRow[];
  const now = Date.now();

  const bookings: BookingView[] = rows
    .map((row) => {
      const offering = row.occurrence?.offering ?? row.course_run?.offering;
      const startsAt = row.occurrence?.starts_at ?? row.course_run?.starts_on;
      if (!offering || !startsAt) return null;

      const when = row.occurrence
        ? formatOccurrence(row.occurrence.starts_at, row.occurrence.ends_at)
        : row.course_run
          ? courseRunWhen(row.course_run)
          : "";

      return {
        id: row.id,
        status: row.status as BookingView["status"],
        offeringTitle: offering.title,
        when,
        participantName: row.participant?.name ?? "",
        pricePaidPence: row.price_paid_pence,
        startsAtMs: new Date(startsAt).getTime(),
      };
    })
    .filter((b): b is BookingView => b !== null);

  const upcoming = bookings
    .filter((b) => b.startsAtMs >= now)
    .sort((a, b) => a.startsAtMs - b.startsAtMs);
  const past = bookings
    .filter((b) => b.startsAtMs < now)
    .sort((a, b) => b.startsAtMs - a.startsAtMs);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          Your bookings
        </h1>
        <p className="mt-1 text-mid">Sessions you&apos;ve booked.</p>
      </div>

      <BookingsList upcoming={upcoming} past={past} />
    </main>
  );
}
