"use client";

import { SKATE_JAM_SIZES, type SkateJamSize, type SkateJamAvailability } from "@/lib/skate-jam-hire";

export function SkateJamHireFields({ participantId, name, value, availability, disabled, onChange }: {
  participantId: string; name: string; value: SkateJamSize | null | undefined;
  availability: SkateJamAvailability | null; disabled: boolean;
  onChange: (value: SkateJamSize | null) => void;
}) {
  return <fieldset disabled={disabled} className="mt-4 space-y-3 rounded-xl border border-line bg-card p-4">
    <legend className="px-1 font-bold">Skates for {name}</legend>
    <p className="text-sm text-mid">Skate hire is free with this pay-as-you-go booking. Adult UK sizes, subject to availability.</p>
    <label className="flex items-center gap-3 font-bold">
      <input type="radio" name={`jam-skates-${participantId}`} checked={value === null} onChange={() => onChange(null)} />
      Bringing my own skates
    </label>
    <label className="block text-sm font-bold">Free skate hire — UK size
      <select className="mt-2 block w-full rounded-lg border border-line bg-card p-3" value={value ?? ""} disabled={disabled || availability === null}
        onChange={event => { const size = Number(event.target.value) as SkateJamSize; if (SKATE_JAM_SIZES.includes(size)) onChange(size); }}>
        <option value="" disabled>Choose a size</option>
        {SKATE_JAM_SIZES.map(size => {
          const remaining = availability?.find(row => row.size === size)?.available ?? 0;
          return <option key={size} value={size} disabled={remaining === 0}>UK {size} — {remaining > 0 ? `${remaining} available` : "fully booked"}</option>;
        })}
      </select>
    </label>
    {availability === null && <p role="alert" className="text-sm text-red-dark">Hire availability could not be loaded. Refresh to try again, or choose to bring your own skates.</p>}
    <p className="text-sm text-muted">Skates are reserved when you continue to payment, not when you add to basket.</p>
  </fieldset>;
}
