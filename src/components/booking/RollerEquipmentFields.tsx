"use client";

import { HIRE_SKATE_SIZES, EQUIPMENT_NOTICE, PROTECTIVE_GEAR_NOTICE, rollerEquipmentSchema, type RollerEquipment } from "@/lib/roller-equipment";

export type EquipmentDraft = { skate_choice?: "own" | "hire"; hire_skate_size?: string | null; protective_gear?: "own" | "borrow" | "provided" };
export function completeEquipment(draft: EquipmentDraft | undefined): RollerEquipment | null {
  const result = rollerEquipmentSchema.safeParse(draft);
  return result.success ? result.data : null;
}

export function RollerEquipmentFields({ participantId, name, value, disabled, onChange }: {
  participantId: string; name: string; value: EquipmentDraft; disabled: boolean; onChange: (value: EquipmentDraft) => void;
}) {
  return <fieldset disabled={disabled} className="mt-4 space-y-3 rounded-xl border border-line bg-card p-4">
    <legend className="px-1 font-bold text-black">Skates for {name}</legend>
    <p className="text-sm text-mid">Choose skates and protective gear before continuing to payment.</p>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
      <input type="radio" name={`skates-${participantId}`} className="mt-1 h-4 w-4 accent-blue" checked={value.skate_choice === "own"} onChange={() => onChange({ skate_choice: "own", hire_skate_size: null })} />
      <span className="font-bold">Bringing their own quad skates</span>
    </label>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
      <input type="radio" name={`skates-${participantId}`} className="mt-1 h-4 w-4 accent-blue" checked={value.skate_choice === "hire"} onChange={() => onChange({ skate_choice: "hire", protective_gear: "provided" })} />
      <span><strong className="block">Hire roller skates</strong><span className="text-sm text-mid">Includes full protective gear, including a helmet.</span></span>
    </label>
    {value.skate_choice === "hire" && <label className="block text-sm font-bold">Choose a hire skate size
      <select className="mt-2 block w-full rounded-lg border border-line bg-card p-3" value={value.hire_skate_size ?? ""} onChange={event => onChange({ ...value, hire_skate_size: event.target.value })}>
        <option value="">Select a size range</option>
        {HIRE_SKATE_SIZES.map(size => <option key={size}>{size}</option>)}
      </select>
    </label>}
    {value.skate_choice === "own" && <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-bold">Does your child need to borrow protective gear?</legend>
      {([['own', 'No, bringing their own full protective gear, including a helmet'], ['borrow', 'Yes, borrow full protective gear, including a helmet']] as const).map(([choice, label]) =>
        <label key={choice} className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="radio" name={`gear-${participantId}`} className="mt-1 h-4 w-4 accent-blue" checked={value.protective_gear === choice} onChange={() => onChange({ ...value, protective_gear: choice })} />{label}
        </label>)}
    </fieldset>}
    <p className="rounded-lg bg-blue-pale p-3 text-sm text-blue-dark"><strong className="block">{EQUIPMENT_NOTICE}</strong>{PROTECTIVE_GEAR_NOTICE}</p>
  </fieldset>;
}
