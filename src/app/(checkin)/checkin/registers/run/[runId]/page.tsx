import { notFound } from "next/navigation";
import { getCourseRunRegister } from "@/lib/admin-data";
import { foundationSessionDates } from "@/lib/course-attendance";
import type { Metadata } from "next";
import { londonToday } from "@/lib/catalogue-filters";
import { FoundationRegisterView } from "@/components/admin/FoundationRegisterView";

export const metadata: Metadata = { title: "Course register — Door Check-in" };
export const dynamic = "force-dynamic";

export default async function FoundationRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { runId } = await params;
  const { date } = await searchParams;
  const run = await getCourseRunRegister(runId);
  if (!run || run.offeringSlug !== "beginners-foundation") notFound();
  const dates = foundationSessionDates(run);
  const selected =
    date ?? dates.find((day) => day >= londonToday()) ?? dates.at(-1);
  if (!selected) notFound();
  return (
    <FoundationRegisterView runId={runId} date={selected} backHref="/checkin" />
  );
}
