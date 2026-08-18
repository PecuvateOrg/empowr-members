import type { Metadata } from "next";
import { listAdminVenues } from "@/lib/admin-data";
import { VenuesManager } from "@/components/admin/VenuesManager";

export const metadata: Metadata = { title: "Venues — Members Admin" };
export const dynamic = "force-dynamic";

export default async function AdminVenuesPage() {
  const venues = await listAdminVenues();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Venues</h1>
        <p className="mt-1 text-mid">
          Where offerings and occurrences run. Deleting a venue that&apos;s in use
          is blocked.
        </p>
      </div>
      <VenuesManager initial={venues} />
    </main>
  );
}
