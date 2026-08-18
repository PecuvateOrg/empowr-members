import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  getAdminOffering,
  listAdminVenues,
  listAdminOccurrences,
  listAdminCourseRuns,
} from "@/lib/admin-data";
import { OfferingForm } from "@/components/admin/OfferingForm";
import { OccurrencesManager } from "@/components/admin/OccurrencesManager";
import { CourseRunsManager } from "@/components/admin/CourseRunsManager";

export const metadata: Metadata = { title: "Edit offering — Members Admin" };
export const dynamic = "force-dynamic";

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const offering = await getAdminOffering(id);
  if (!offering) notFound();

  const venues = await listAdminVenues();
  const [occurrences, courseRuns] = await Promise.all([
    offering.enrolment_scope === "per_occurrence"
      ? listAdminOccurrences(id)
      : Promise.resolve([]),
    offering.enrolment_scope === "per_run" ? listAdminCourseRuns(id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <Link
        href="/admin/offerings"
        className="flex w-fit items-center gap-1.5 text-sm font-bold text-mid transition-colors hover:text-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Offerings
      </Link>

      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          {offering.title}
        </h1>
        <p className="mt-1 text-mid">/sessions/{offering.slug}</p>
      </div>

      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-extrabold text-black">Details</h2>
        <div className="mt-5">
          <OfferingForm initial={offering} venues={venues} />
        </div>
      </section>

      {offering.enrolment_scope === "per_occurrence" ? (
        <section>
          <h2 className="text-xl font-extrabold text-black">Dates</h2>
          <p className="mt-1 text-sm text-mid">
            Every date members can book. Cancelling one notifies and
            refunds/credits everyone booked on it.
          </p>
          <div className="mt-5">
            <OccurrencesManager offeringId={id} venues={venues} initial={occurrences} />
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-xl font-extrabold text-black">Course runs</h2>
          <p className="mt-1 text-sm text-mid">
            One payment covers the whole run — members enrol against the run,
            not individual dates.
          </p>
          <div className="mt-5">
            <CourseRunsManager
              offeringId={id}
              offeringPricePence={offering.price_pence}
              initial={courseRuns}
            />
          </div>
        </section>
      )}
    </main>
  );
}
