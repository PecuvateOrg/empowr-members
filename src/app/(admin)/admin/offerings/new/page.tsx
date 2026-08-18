import type { Metadata } from "next";
import { listAdminVenues } from "@/lib/admin-data";
import { OfferingForm } from "@/components/admin/OfferingForm";

export const metadata: Metadata = { title: "New offering — Members Admin" };
export const dynamic = "force-dynamic";

export default async function NewOfferingPage() {
  const venues = await listAdminVenues();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">
          New offering
        </h1>
        <p className="mt-1 text-mid">
          Save first, then add dates or course runs from its own page.
        </p>
      </div>
      <div className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <OfferingForm venues={venues} />
      </div>
    </main>
  );
}
