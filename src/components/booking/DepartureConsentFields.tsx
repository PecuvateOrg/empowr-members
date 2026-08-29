"use client";

// The travel-method + confirmation-checklist part of the departure consent
// form — shared by BookingForm (online) and WalkInPanel (door) so the field
// list and wording can't drift between the two surfaces. The surrounding
// "leaving unaccompanied" enable toggle stays with each caller, since its
// framing text differs slightly by context; this component only renders
// once that toggle is on.
import {
  TRAVEL_METHOD_LABELS,
  type DepartureConsentState,
} from "@/lib/departure-consent-form";

const CONFIRMATIONS = [
  ["confirm_mature", "I confirm they're mature enough to leave unaccompanied"],
  ["confirm_knows_route", "I confirm they know their route home"],
  ["confirm_will_inform_staff", "I'll inform staff before they leave"],
  ["confirm_accepts_responsibility", "I accept responsibility once they leave the venue"],
  ["confirm_understands_staff_override", "I understand staff can refuse to let them leave if they have concerns"],
] as const;

export function DepartureConsentFields({
  state,
  onChange,
  disabled,
}: {
  state: DepartureConsentState;
  onChange: (patch: Partial<DepartureConsentState>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <div>
        <label className="block text-sm font-bold text-black">
          How are they getting home?
        </label>
        <select
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-black"
          value={state.travel_method}
          disabled={disabled}
          onChange={(e) =>
            onChange({ travel_method: e.target.value as DepartureConsentState["travel_method"] })
          }
        >
          {Object.entries(TRAVEL_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {state.travel_method === "other" && (
        <input
          type="text"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-black"
          placeholder="Describe how they're getting home"
          value={state.travel_method_other}
          disabled={disabled}
          onChange={(e) => onChange({ travel_method_other: e.target.value })}
        />
      )}

      {CONFIRMATIONS.map(([key, label]) => (
        <label
          key={key}
          className="flex items-start gap-2.5 text-sm font-semibold text-mid"
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue"
            checked={state[key]}
            disabled={disabled}
            onChange={(e) => onChange({ [key]: e.target.checked })}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
