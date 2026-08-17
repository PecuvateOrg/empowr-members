import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getRegister } from "@/lib/admin-data";
import { formatOccurrence, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";

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

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <Link
        href="/admin/offerings"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Offerings
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {register.offering?.title ?? "Register"}
        </h1>
        <p className="mt-1 text-mid">
          {formatOccurrence(register.starts_at, register.ends_at)} ·{" "}
          {active.length} on the register
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
