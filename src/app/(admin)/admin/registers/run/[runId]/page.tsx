// The enrolment roll for one course run.
//
// Sits at /admin/registers/run/[runId] rather than under the existing
// /admin/registers/[occurrenceId], because the two are different documents.
// The occurrence register is a DOOR tool — check people in, add a walk-in,
// mark attended — and all of that hangs off a date. A per_run course has no
// mem_occurrences rows at all, so there is no date to hang it on; what staff
// need from a course is the roll: who is on it, is their waiver signed, and
// do they have medical notes. Deliberately no check-in, no walk-in panel.
//
// Two segments deep, so it cannot collide with the single-segment
// [occurrenceId] route.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Users } from "lucide-react";
import { getCourseRunRegister } from "@/lib/admin-data";
import { formatDate, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status-labels";

export const metadata: Metadata = { title: "Course roll — Members Admin" };
export const dynamic = "force-dynamic";

export default async function CourseRunRegisterPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getCourseRunRegister(runId);
  if (!run) notFound();

  // A pending_payment hold occupies a place for ~41 minutes (30-minute hold +
  // Stripe's 31-minute session + grace), so a roll that counted only confirmed
  // enrolments would show free places that are in fact taken. Same reasoning
  // as the occurrence register.
  const enrolled = run.bookings.filter(
    (b) => b.status === "confirmed" || b.status === "attended"
  ).length;
  const pending = run.bookings.filter(
    (b) => b.status === "pending_payment"
  ).length;
  const taken = enrolled + pending;
  const unsigned = run.bookings.filter((b) => !b.waiverSigned).length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href={`/admin/offerings/${run.offeringId}`}
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {run.offeringTitle}
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {run.label}
        </h1>
        <p className="mt-1 text-mid">
          {run.starts_on && run.ends_on
            ? `${formatDate(run.starts_on)} – ${formatDate(run.ends_on)}`
            : "Dates not set"}
          {run.venueName && ` · ${run.venueName}`}
        </p>
        <p className="mt-2 flex items-center gap-1.5 font-bold text-black">
          <Users className="h-4 w-4 text-blue" aria-hidden />
          {taken} enrolled
          {run.capacity !== null && ` of ${run.capacity}`}
          {pending > 0 && (
            <span className="font-semibold text-mid">
              {" "}
              ({pending} still paying)
            </span>
          )}
        </p>
      </div>

      {/* Surfaced above the table as well as in it: on a long roll the one row
          that matters is easy to scroll past, and an unsigned waiver is the
          single thing that stops someone taking part. */}
      {unsigned > 0 && (
        <section className="rounded-2xl border border-red-dark bg-red-soft p-5">
          <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-red-dark">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            {unsigned} {unsigned === 1 ? "person has" : "people have"} no signed
            waiver
          </h2>
          <p className="mt-1 text-sm font-semibold text-red-dark">
            They must not take part until it is signed.
          </p>
        </section>
      )}

      {run.bookings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          Nobody has enrolled on this course yet.
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
                <th className="px-4 py-3">Waiver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {run.bookings.map((booking) => (
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
                  <td className="px-4 py-3">
                    {booking.waiverSigned ? (
                      <span className="font-semibold text-mid">Signed</span>
                    ) : (
                      <span className="rounded-full bg-red-soft px-3 py-1 text-xs font-extrabold text-red-dark">
                        No waiver — do not let them take part
                      </span>
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
