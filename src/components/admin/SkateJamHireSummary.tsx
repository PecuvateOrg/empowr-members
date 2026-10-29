import type { RegisterRow } from "@/lib/admin-data";
import { SKATE_JAM_SIZES, jamHireDescription } from "@/lib/skate-jam-hire";

export function SkateJamHireSummary({ bookings, unavailable }: { bookings: RegisterRow[]; unavailable?: boolean }) {
  const rows = bookings.filter(row => row.source === "online" && ["confirmed", "attended"].includes(row.status));
  return <section aria-label="Skate Jam hire" className="space-y-4 rounded-2xl border border-line bg-card p-5">
    <h2 className="text-xl font-extrabold">Skate Jam — skates to prepare</h2>
    {unavailable ? <p role="alert">Skate hire information could not be loaded. Refresh or confirm with each skater.</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{SKATE_JAM_SIZES.map(size => <p key={size} className="rounded-xl border border-line p-3">
        <strong className="block">UK {size}</strong>{rows.filter(row => row.jamHire?.requested && row.jamHire.size === size).length} pairs to prepare
      </p>)}</div>
      <ul className="divide-y divide-line">{rows.map(row => <li key={row.id} className="py-2">
        <strong>{row.participant?.name ?? "Skater"}</strong>: {jamHireDescription(row.jamHire?.requested ?? null, row.jamHire?.size ?? null)}
      </li>)}</ul>
      <p className="text-sm text-muted">Confirmed pay-as-you-go bookings, including checked-in skaters. Pending payments and subscriptions are not in these preparation totals.</p>
    </>}
  </section>;
}
