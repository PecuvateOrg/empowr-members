import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getRegister } from "@/lib/admin-data";
import { formatOccurrence, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";
import { MarkAttendedButton } from "@/components/admin/MarkAttendedButton";
import { ReleaseHoldButton } from "@/components/admin/ReleaseHoldButton";
import { WalkInPanel } from "@/components/admin/WalkInPanel";

export const metadata: Metadata = { title: "Register — Members Admin" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const register = await getRegister(occurrenceId);
  if (!register) notFound();

  const active = register.bookings.filter(
    (b) => b.status === "confirmed" || b.status === "attended"
  );
  // Holds count against capacity for ~41 minutes (30-minute hold + Stripe's
  // 31-minute session + 10 minutes of grace), so a register that reported
  // only confirmed places would show free space that is actually taken.
  const pending = register.bookings.filter(
    (b) => b.status === "pending_payment"
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href="/admin/checkin"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Check in
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {register.offering?.title ?? "Register"}
        </h1>
        <p className="mt-1 text-mid">
          {formatOccurrence(register.starts_at, register.ends_at)} ·{" "}
          {active.length} on the register
          {register.subscribers.length > 0 &&
            ` · ${register.subscribers.length} subscribed`}
          {pending.length > 0 && ` · ${pending.length} awaiting payment`}
        </p>
      </div>

      {register.bookings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No bookings on this date yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-pale/50 text-xs font-bold uppercase tracking-wide text-mid">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Check in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {register.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="px-4 py-3 font-bold text-black">
                    {booking.participant?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-mid">
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </td>
                  <td className="px-4 py-3 font-semibold text-mid">
                    {booking.price_paid_pence !== null
                      ? formatPrice(booking.price_paid_pence)
                      : "—"}
                    {booking.source === "walk_in" && (
                      <span className="ml-1.5 rounded-full bg-blue-pale px-2 py-0.5 text-xs font-bold text-blue-dark">
                        Door
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {booking.participant?.medical_notes ? (
                      <span className="flex items-center gap-1 font-semibold text-red-dark">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        {booking.participant.medical_notes}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {booking.status === "confirmed" ||
                    booking.status === "attended" ? (
                      <MarkAttendedButton
                        bookingId={booking.id}
                        alreadyAttended={booking.status === "attended"}
                      />
                    ) : booking.status === "pending_payment" ? (
                      <ReleaseHoldButton bookingId={booking.id} />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {register.subscribers.length > 0 && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-extrabold text-black">Subscribers</h2>
          <p className="mt-1 text-sm text-mid">
            These skaters hold a subscription covering this session, so they
            have not booked and have not paid today. Their place is reserved —
            check them in as normal. This list updates itself: cancelling a
            subscription removes the person from here straight away.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {register.subscribers.map((sub) => (
              <li
                key={sub.participantId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-extrabold text-black">{sub.name}</p>
                  <p className="text-sm text-mid">{sub.planName}</p>
                  {sub.medicalNotes && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-red-dark">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {sub.medicalNotes}
                    </p>
                  )}
                </div>
                {sub.waiverSigned ? (
                  <span className="rounded-full bg-blue-pale px-3 py-1 text-xs font-extrabold text-blue-dark">
                    Waiver signed
                  </span>
                ) : (
                  <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                    No waiver — do not let them take part
                  </span>
                )}
              </li>
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
