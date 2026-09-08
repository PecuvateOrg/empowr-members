// The occurrence register, shared by the admin and door check-in routes.
//
// WHY THIS IS ONE COMPONENT. Until now these were two 244-line page files
// differing in exactly three strings: the <title>, the back link and the
// check-in guide link. Everything that matters at a door — the capacity
// warning, the waiver block, the medical notes, the walk-in panel — existed
// twice, and a fix applied to one would have silently missed the other. This
// codebase has already had that failure with PublicHeader / MemberHeader /
// AdminHeader and says so in lib/emails/shell.ts. The departure information
// this component adds is exactly the kind of safeguarding detail that must
// never be present on one register and absent from the other.
//
// A server component: it renders the interactive bits (RegisterBookingRow,
// RegisterSubscriberItem, WalkInPanel) as client children, so it needs no
// "use client" of its own.
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { RegisterOccurrence } from "@/lib/admin-data";
import { formatOccurrence } from "@/lib/format";
import { summariseRegister } from "@/lib/register-summary";
import { RegisterBookingRow } from "@/components/admin/RegisterBookingRow";
import { RegisterSubscriberItem } from "@/components/admin/RegisterSubscriberItem";
import { WalkInPanel } from "@/components/admin/WalkInPanel";

export function RegisterView({
  register,
  backHref,
  backLabel,
  guideHref,
}: {
  register: RegisterOccurrence;
  backHref: string;
  backLabel: string;
  guideHref: string;
}) {
  const active = register.bookings.filter(
    (b) => b.status === "confirmed" || b.status === "attended"
  );
  // Holds count against capacity for ~41 minutes (30-minute hold + Stripe's
  // 31-minute session + 10 minutes of grace), so a register that reported
  // only confirmed places would show free space that is actually taken.
  const pending = register.bookings.filter(
    (b) => b.status === "pending_payment"
  );

  // Arithmetic lives in lib/register-summary.ts so the over-capacity branch
  // can be tested independently of this page.
  const { expected, systemCount, capacity, overCapacity, stillSellable } =
    summariseRegister({
      confirmed: register.bookings.filter((b) => b.status === "confirmed").length,
      attended: register.bookings.filter((b) => b.status === "attended").length,
      pending: pending.length,
      subscribers: register.subscribers.length,
      capacity: register.capacity,
    });

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {register.offering?.title ?? "Register"}
        </h1>
        <p className="mt-1 text-mid">
          {formatOccurrence(register.starts_at, register.ends_at)}
          {capacity !== null && (
            <>
              {" · "}
              <span className={overCapacity ? "font-extrabold text-red-dark" : "font-bold"}>
                {expected} of {capacity} places
              </span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-sm text-mid">
          {active.length} booked
          {register.subscribers.length > 0 &&
            ` · ${register.subscribers.length} subscribed`}
          {pending.length > 0 && ` · ${pending.length} awaiting payment`}
        </p>
      </div>

      {/* Only when it actually matters. A capacity line that is always
          present but usually fine trains staff to stop reading it. */}
      {overCapacity && (
        <section className="rounded-2xl border border-red bg-red-soft p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-red-dark">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            Over capacity
          </h2>
          <p className="mt-2 text-sm font-semibold text-mid">
            {expected} people are entitled to attend a {capacity}-place session.
            Subscribers hold no booking, so the booking system has counted only{" "}
            {systemCount}
            {stillSellable !== null && stillSellable > 0 ? (
              <>
                {" "}
                and will sell {stillSellable} more place
                {stillSellable === 1 ? "" : "s"}.
              </>
            ) : (
              "."
            )}
          </p>
        </section>
      )}

      {register.bookings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No bookings on this date yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          {/* Four columns plus the toggle. "Leaving" and "Emergency contact"
              arrived as columns six and seven and pushed "Check in" off the
              right edge of a tablet; "Notes" followed them into the expander
              because one long note from one parent stretched the table for
              everybody on it. That detail now opens per row — see
              RegisterBookingRow, and SafetyFlags for what stays visible while
              a row is shut. Any change to the column count has to reach
              RegisterBookingRow's COLUMN_COUNT; verify:register-safety-presence
              fails if it does not. */}
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-pale/50 text-xs font-bold uppercase tracking-wide text-mid">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Check in</th>
                <th className="px-2 py-3">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {register.bookings.map((booking) => (
                <RegisterBookingRow key={booking.id} booking={booking} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {register.subscribers.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-extrabold text-black">Recently subscribed</h2>
          {/* Since Phase 2 Step 4, a subscriber normally appears in the main
              table above like anyone else — the webhook adds them the moment
              they subscribe. This section is now the gap between that and a
              daily catch-up sweep (a brand-new occurrence, or a webhook that
              failed), so it should read as transient, not as the everyday
              case it used to be — there is still no check-in button here,
              because these skaters hold no booking row yet. */}
          <p className="mt-1 text-sm text-mid">
            These skaters hold a subscription covering this session but
            haven&apos;t been added to the list above yet — that happens
            automatically, usually within a day. Their place is reserved.
            There is no check-in button for them yet — tick them off as they
            arrive.{" "}
            <Link href={guideHref} className="font-bold text-blue underline">
              How check-in works
            </Link>
            .
          </p>
          <ul className="mt-4 divide-y divide-line">
            {register.subscribers.map((sub) => (
              <RegisterSubscriberItem key={sub.participantId} sub={sub} />
            ))}
          </ul>
        </section>
      )}

      <WalkInPanel
        occurrenceId={register.id}
        offeringTitle={register.offering?.title ?? "this session"}
        walkInPricePence={register.offering?.walk_in_price_pence ?? null}
        sessionOver={new Date(register.ends_at) <= new Date()}
      />
    </main>
  );
}
