import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFoundationCheckinRegister } from "@/lib/foundation-checkin";
import {
  canCheckInCourseDate,
  foundationSessionDates,
} from "@/lib/course-attendance";
import { formatDate } from "@/lib/format";
import { RegisterBookingRow } from "@/components/admin/RegisterBookingRow";

export async function FoundationRegisterView({
  runId,
  date,
  backHref,
}: {
  runId: string;
  date: string;
  backHref: string;
}) {
  const register = await getFoundationCheckinRegister(runId, date);
  if (!register) notFound();
  const { run, checkedIn } = register;
  const allowCheckin = canCheckInCourseDate(date);
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <Link
        href={backHref}
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Check in
      </Link>
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {run.offeringTitle}
        </h1>
        <p className="mt-1 text-mid">
          {run.label} · {formatDate(date)}
          {run.starts_at_local && ` · ${run.starts_at_local.slice(0, 5)}`}
          {run.ends_at_local && `–${run.ends_at_local.slice(0, 5)}`}
          {run.venueName && ` · ${run.venueName}`}
        </p>
        <p className="mt-1 text-sm font-semibold text-mid">
          {checkedIn.size} checked in ·{" "}
          {
            run.bookings.filter(
              (booking) =>
                booking.status === "confirmed" || booking.status === "attended",
            ).length
          }{" "}
          enrolled
        </p>
      </div>
      <nav aria-label="Course session dates" className="flex flex-wrap gap-2">
        {foundationSessionDates(run).map((sessionDate) => (
          <Link
            key={sessionDate}
            href={`?date=${sessionDate}`}
            aria-current={sessionDate === date ? "page" : undefined}
            className={`rounded-lg border px-3 py-3 text-sm font-bold ${sessionDate === date ? "border-blue bg-blue-pale text-blue-dark" : "border-line text-mid hover:bg-blue-pale"}`}
          >
            {formatDate(sessionDate)}
          </Link>
        ))}
      </nav>
      {!allowCheckin && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          Check-in opens on the session date.
        </p>
      )}
      {run.bookings.length === 0 ? (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          Nobody has enrolled on this course yet.
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line">
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
              {run.bookings.map((booking) => (
                <RegisterBookingRow
                  key={`${date}:${booking.id}`}
                  booking={booking}
                  courseSessionDate={date}
                  courseCheckedIn={checkedIn.has(booking.id)}
                  checkinDisabled={!allowCheckin}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
