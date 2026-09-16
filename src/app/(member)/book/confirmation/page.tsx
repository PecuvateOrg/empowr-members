import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/booking/AutoRefresh";
import { ClearBasketOnConfirmation } from "@/components/booking/ClearBasketOnConfirmation";
import { formatPrice, formatOccurrence } from "@/lib/format";

export const dynamic = "force-dynamic";

type ConfirmationRow = {
  id: string;
  account_id: string;
  status: string;
  price_paid_pence: number | null;
  participant: { name: string } | null;
  occurrence: {
    id: string;
    starts_at: string;
    ends_at: string;
    offering: { title: string } | null;
  } | null;
  course_run: {
    id: string;
    label: string;
    offering: { title: string } | null;
  } | null;
};

type ConfirmationGroup = {
  key: string;
  offering: string;
  when: string;
  names: string[];
  total: number;
};

function groupRows(rows: ConfirmationRow[]): ConfirmationGroup[] {
  const groups = new Map<string, ConfirmationRow[]>();
  for (const row of rows) {
    const key = row.occurrence
      ? `occurrence:${row.occurrence.id}`
      : `course:${row.course_run?.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const first = group[0];
    return {
      key,
      offering:
        first.occurrence?.offering?.title ?? first.course_run?.offering?.title ?? "Booking",
      when: first.occurrence
        ? formatOccurrence(first.occurrence.starts_at, first.occurrence.ends_at)
        : first.course_run?.label ?? "",
      names: group
        .map((row) => row.participant?.name)
        .filter((name): name is string => Boolean(name)),
      total: group.reduce((sum, row) => sum + (row.price_paid_pence ?? 0), 0),
    };
  });
}

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
        `id, account_id, status, price_paid_pence,
         participant:mem_participants(name),
         occurrence:mem_occurrences(id, starts_at, ends_at, offering:mem_offerings(title)),
         course_run:mem_course_runs(id, label, offering:mem_offerings(title))`
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

  const groups = groupRows(rows);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const allConfirmed = rows.every((row) => row.status === "confirmed");
  const anyPending = rows.some((row) => row.status === "pending_payment");

  if (allConfirmed) {
    return (
      <>
        <ClearBasketOnConfirmation
          accountId={rows[0].account_id}
          checkoutSessionId={session_id!}
        />
        <Panel
          icon={<CheckCircle2 className="mx-auto h-10 w-10 text-blue" aria-hidden />}
          title={groups.length > 1 ? "Bookings confirmed" : "Booking confirmed"}
          body={<BookingSummary groups={groups} total={total} confirmed />}
          showBookingActions
        />
      </>
    );
  }

  if (anyPending) {
    return (
      <>
        <AutoRefresh active />
        <Panel
          icon={<Clock3 className="mx-auto h-10 w-10 text-blue" aria-hidden />}
          title={groups.length > 1 ? "Confirming your bookings…" : "Confirming your booking…"}
          body={<BookingSummary groups={groups} total={total} />}
        />
      </>
    );
  }

  return (
    <Panel
      icon={<XCircle className="mx-auto h-10 w-10 text-blue" aria-hidden />}
      title="This payment wasn't completed"
      body="The payment didn't go through, so no spaces are held. Your basket is still available if you want to try again."
    />
  );
}

function BookingSummary({
  groups,
  total,
  confirmed = false,
}: {
  groups: ConfirmationGroup[];
  total: number;
  confirmed?: boolean;
}) {
  return (
    <div className="mt-4 space-y-3 text-left">
      {groups.map((group) => (
        <div key={group.key} className="rounded-xl bg-white/70 p-4">
          <p className="font-extrabold text-black">{group.offering}</p>
          <p className="mt-1 text-sm font-semibold text-mid">{group.when}</p>
          <p className="mt-1 text-sm font-semibold text-mid">{group.names.join(", ")}</p>
          <p className="mt-2 font-black text-blue-dark">{formatPrice(group.total)}</p>
        </div>
      ))}
      <p className="text-center font-extrabold text-blue-dark">
        {formatPrice(total)} {confirmed ? "paid — see you there!" : "paid — just confirming your spaces."}
      </p>
    </div>
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
  body: React.ReactNode;
  showBookingActions?: boolean;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl bg-blue-pale p-6 text-center">
        {icon}
        <h1 className="mt-3 text-xl font-extrabold text-blue-dark">{title}</h1>
        {typeof body === "string" ? (
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-blue-dark">{body}</p>
        ) : (
          body
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href={showBookingActions ? "/sessions" : "/basket"}
            className="inline-flex min-h-11 items-center rounded-full bg-blue px-6 py-2.5 font-extrabold text-white shadow-blue transition-colors hover:bg-blue-dark"
          >
            {showBookingActions ? "Book another session" : "Back to basket"}
          </Link>
          {showBookingActions && (
            <Link
              href="/bookings"
              className="inline-flex min-h-11 items-center rounded-full border-2 border-blue px-6 py-2 font-extrabold text-blue-dark transition-colors hover:bg-white"
            >
              View my bookings
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
