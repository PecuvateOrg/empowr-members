// My Bookings — upcoming/past, with self-serve cancellation and transfer.
// Read is RLS-scoped (own rows only); BOTH policies shown here are
// render-time ESTIMATES — the POST routes re-check them at the moment of
// action and are the source of truth.
//
// The transfer estimate decides only whether the "Move to another date"
// action is offered. The dates themselves are NOT loaded here: that needs a
// capacity read per booking, and this page renders every booking a member
// has. They are fetched from GET /api/bookings/[id]/transfer when the member
// opens the picker.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthedAccount } from "@/lib/auth";
import { formatOccurrence, courseRunWhen } from "@/lib/format";
import { evaluateCancellationPolicy } from "@/lib/cancellation";
import { evaluateTransferPolicy } from "@/lib/transfer";
import { BookingsList, type BookingView } from "@/components/bookings/BookingsList";

export const metadata: Metadata = { title: "Your bookings — Empowr Members" };
export const dynamic = "force-dynamic";

type OfferingJoin = {
  title: string;
  refund_policy: "standard" | "non_refundable";
  transferable: boolean;
  enrolment_scope: "per_occurrence" | "per_run";
};

type BookingRow = {
  id: string;
  status: string;
  price_paid_pence: number | null;
  created_at: string;
  transferred_at: string | null;
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
    starts_at_local: string | null;
    ends_at_local: string | null;
    offering: OfferingJoin | null;
  } | null;
};

export default async function BookingsPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_bookings")
    .select(
      `id, status, price_paid_pence, created_at, transferred_at,
       participant:mem_participants(name),
       occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title, refund_policy, transferable, enrolment_scope)),
       course_run:mem_course_runs(label, starts_on, ends_on, starts_at_local, ends_at_local, offering:mem_offerings(title, refund_policy, transferable, enrolment_scope))`
    )
    .order("created_at", { ascending: false });

  // ⚠️ NEVER go back to `const { data } = await ...` here. The Supabase
  // client RETURNS errors rather than throwing, so a destructure that drops
  // `error` turns any failed query into `data = null` — which this page then
  // renders as "No upcoming bookings yet". A member with bookings is told,
  // calmly and wrongly, that they have none.
  //
  // That is not hypothetical. On 2026-09-17 the transfer migration added a
  // second foreign key from mem_bookings to mem_occurrences, which made the
  // `occurrence:mem_occurrences(...)` embed below ambiguous to PostgREST
  // (PGRST201, HTTP 300). Every booking vanished from this page and nothing
  // anywhere reported a fault. Throwing puts it in the logs and on the error
  // boundary, where a broken read belongs.
  //
  // That boundary is app/(member)/error.tsx, added 2026-09-17. When this
  // comment was first written there was none anywhere in the app, so a throw
  // here landed on Next's unstyled 500. The same change swept the sibling
  // reads that still dropped `error`; verify:read-error-handling now fails
  // CI if one comes back.
  if (error) {
    console.error("bookings read failed", authed.account.id, error);
    throw new Error("bookings_read_failed");
  }

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
        cancellation:
          row.status === "confirmed"
            ? evaluateCancellationPolicy(offering.refund_policy, startsAt)
            : null,
        // Only occurrence bookings can move. A course run has no
        // occurrence_id for the RPC to repoint, which is decision #4.
        transfer:
          row.status === "confirmed" && row.occurrence
            ? evaluateTransferPolicy({
                transferable: offering.transferable,
                enrolmentScope: offering.enrolment_scope,
                startsAt,
                transferredAt: row.transferred_at,
              })
            : null,
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
        <p className="mt-1 text-mid">
          Sessions you&apos;ve booked. You can move or cancel an eligible
          booking up to 48 hours before it starts.
        </p>
      </div>

      <BookingsList upcoming={upcoming} past={past} />
    </main>
  );
}
