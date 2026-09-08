"use client";

import { useState } from "react";
import type { RegisterRow } from "@/lib/admin-data";
import { summariseEquipment, equipmentDescription, HIRE_SKATE_SIZES } from "@/lib/roller-equipment";

export function RollerEquipmentSummary({ bookings, unavailable }: { bookings: RegisterRow[]; unavailable?: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const summary = summariseEquipment(bookings);
  const rows = summary.rows.filter(row => {
    const equipment = row.equipment;
    const matches = filter === "all" || (filter === "hire" && equipment?.skate_choice === "hire") ||
      (filter === "own" && equipment?.skate_choice === "own") || (filter === "borrow" && equipment?.protective_gear === "borrow") ||
      (filter === "missing" && !equipment) || equipment?.hire_skate_size === filter;
    return matches && `${row.participant?.name ?? ""} ${row.id}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <section className="space-y-4 rounded-2xl border border-line bg-card p-5 sm:p-6" aria-label="Camp equipment">
    <h2 className="text-xl font-extrabold text-black">Skates &amp; protective gear</h2>
    <p className="text-sm text-mid">Confirmed standard online bookings for this session, including checked-in children. Full check-in and child information remains in the register below.</p>
    {unavailable ? <p role="alert" className="rounded-lg bg-red-soft p-3 font-bold text-red-dark">Equipment information could not be loaded. Refresh to try again; confirm requirements with parents before preparing equipment.</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...summary.sizes.map(s => ({ label: s.size, count: s.pairs })), { label: "Total skate hire", count: summary.hire }].map(tile => <div key={tile.label} className="rounded-xl border border-line p-3"><h3 className="text-sm font-bold text-mid">{tile.label}</h3><p className="text-3xl font-black text-blue">{tile.count}</p><p className="text-xs text-muted">pairs to prepare</p></div>)}
      </div>
      <p className="rounded-lg bg-blue-pale p-3 text-sm font-semibold text-blue-dark">Prepare {summary.gear} full protective gear sets, including {summary.gear} helmets: {summary.hire} with skate hire + {summary.borrow} for children bringing their own skates.</p>
      {summary.missing > 0 && <p className="text-sm font-bold text-red-dark">{summary.missing} equipment {summary.missing === 1 ? "choice is" : "choices are"} not recorded. Confirm with parents; these requirements are not included in the equipment totals.</p>}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 text-sm font-bold">Search child or booking<input type="search" className="mt-1 block w-full rounded-lg border border-line bg-card p-3" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="text-sm font-bold">Equipment filter<select className="mt-1 block w-full rounded-lg border border-line bg-card p-3" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All equipment choices</option><option value="hire">All skate hire</option>
          {HIRE_SKATE_SIZES.map(size => <option key={size} value={size}>Hire: {size}</option>)}
          <option value="own">Own skates</option><option value="borrow">Own skates + borrowed gear</option><option value="missing">Not recorded</option>
        </select></label>
      </div>
      <ul className="divide-y divide-line">{rows.map(row => <li key={row.id} className="py-3 text-sm"><strong className="block text-black">{row.participant?.name ?? "Child name unavailable"}</strong><span className="block break-all text-xs text-muted">Booking: {row.id}</span><span className="text-mid">{equipmentDescription(row.equipment)}</span></li>)}</ul>
      <p role="status" className="text-sm text-muted">Showing {rows.length} of {summary.rows.length} children. Totals cover the whole session, even when filtered.</p>
    </>}
  </section>;
}
