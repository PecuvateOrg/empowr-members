// Post-Checkout landing (success_url). The webhook is what confirms
// bookings — this page only reads (RLS, own rows) and auto-refreshes
// briefly while the confirmation lands. Step 7's My Bookings page will
// link back here from history.
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/booking/AutoRefresh";
import { formatPrice, formatOccurrence } from "@/lib/format";

export const dynamic = "force-dynamic";

type ConfirmationRow = {
  id: string;
  status: string;
  price_paid_pence: number | null;
  participant: { name: string } | null;
  occurrence: {
    starts_at: string;
    ends_at: string;
    offering: { title: string } | null;
  } | null;
  course_run: { label: string; offering: { title: string } | null } | null;
};

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let rows: ConfirmationRow[] = [];
  if (session_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("mem_bookings")
      .select(
        `id, status, price_paid_pence,
         participant:mem_participants(name),
         occurrence:mem_occurrences(starts_at, ends_at, offering:mem_offerings(title)),
         course_run:mem_course_runs(label, offering:mem_offerings(title))`
      )
      .eq("stripe_checkout_session_id", session_id);
    rows = (data ?? []) as unknown as ConfirmationRow[];
  }

  if (rows.length === 0) {
    return (
      <Panel
        icon={<XCircle className="mx-auto h-10 w-10 text-blue" aria-hidden />}
        title="Booking not found"
        body="We couldn't find this booking. If you've just paid, your confirmation may still be on its way — check back in a minute."
      />
    );
  }

  const first = rows[0];
  const offering =
    first.occurrence?.offering?.title ?? first.course_run?.offering?.title ?? "";
  const when = first.occurrence
    ? formatOccurrence(first.occurrence.starts_at, first.occurrence.ends_at)
    : first.course_run?.label ?? "";
  const names = rows
    .map((r) => r.participant?.name)
    .filter(Boolean)
    .join(", ");
  const total = rows.reduce((sum, r) => sum + (r.price_paid_pence ?? 0), 0);
  const detail = [offering, when, names].filter(Boolean).join(" · ");

  const allConfirmed = rows.every((r) => r.status === "confirmed");
  const anyPending = rows.some((r) => r.status === "pending_payment");

  if (allConfirmed) {
    return (
      <Panel
        icon={<CheckCircle2 className="mx-auto h-10 w-10 text-blue" aria-hidden />}
        title="Booking confirmed"
        body={`${detail} — ${formatPrice(total)} paid. See you there!`}
        showBookingActions
      />
    );
  }

  if (anyPending) {
    return (
      <>
        <AutoRefresh active />
        <Panel
          icon={<Clock3 className="mx-auto h-10 w-10 text-blue" aria-hidden />}
          title="Confirming your booking…"
          body={`${detail} — payment received, just confirming your space. This page updates automatically.`}
        />
      </>
    );
  }

  return (
    <Panel
      icon={<XCircle className="mx-auto h-10 w-10 text-blue" aria-hidden />}
      title="This booking wasn't completed"
      body="The payment didn't go through, so no space is held. You can book again from the sessions page."
    />
  );
}

function Panel({
  icon,
  title,
  body,
  showBookingActions = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  showBookingActions?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-blue-pale p-6 text-center">
        {icon}
        <h1 className="mt-3 text-xl font-extrabold text-blue-dark">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-blue-dark">
          {body}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/sessions"
            className="inline-block rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
          >
            {showBookingActions ? "Book another session" : "Back to sessions"}
          </Link>
          {showBookingActions && (
            <Link
              href="/bookings"
              className="inline-block rounded-full border-2 border-blue px-6 py-2 font-extrabold text-blue-dark transition-colors hover:bg-white"
            >
              View my bookings
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
