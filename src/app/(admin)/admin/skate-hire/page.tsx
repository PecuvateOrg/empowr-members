import { SkateHireStockManager } from "@/components/admin/SkateHireStockManager";

export default function SkateHirePage() {
  return <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-black">Skate hire stock</h1>
    <p className="font-semibold text-mid">How many pairs of free hire skates you own in each UK size. Skate Jam and SYNKRON8 pay-as-you-go bookings, and Level 1 courses marked for free hire, can reserve them.</p>
    <SkateHireStockManager />
  </main>;
}
