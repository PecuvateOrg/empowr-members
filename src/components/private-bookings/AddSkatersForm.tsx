"use client";

// "Add skaters" on the host's private booking page. Birthday: how many more
// (guests then join through the invite link, waiver and all). Group coaching:
// which household skaters, with equipment. Pays through Stripe; the places are
// added once the payment is confirmed. The price shown is an estimate — the
// database prices the addition itself.
import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import {
  EQUIPMENT,
  EQUIPMENT_OPTION_LABELS,
  HIRE_SIZES,
  isHired,
  privateTopupPrice,
  type Equipment,
  type HireSize,
  type PrivateBookingType,
} from "@/lib/private-bookings";

type Skater = { id: string; name: string; waiverSigned: boolean };
type Choice = { equipment: Equipment; hire_size: HireSize | "" };

export function AddSkatersForm({
  bookingId,
  type,
  hours,
  maxMore,
  household,
}: {
  bookingId: string;
  type: Pick<PrivateBookingType, "kind" | "unit_price_pence" | "hire_price_pence">;
  hours: number;
  maxMore: number;
  /** Group coaching only: the host's skaters not already on the booking. */
  household: Skater[];
}) {
  const isBirthday = type.kind === "birthday";
  const [count, setCount] = useState("1");
  const [chosen, setChosen] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = Object.keys(chosen);
  const added = isBirthday ? Number(count) : ids.length;
  const validCount = Number.isInteger(added) && added >= 1 && added <= maxMore;
  const hireCount = ids.filter((id) => isHired(chosen[id].equipment)).length;
  const equipmentComplete = ids.every((id) => chosen[id].equipment !== "hire" || chosen[id].hire_size);
  const price = validCount ? privateTopupPrice(type, hours, added, hireCount) : null;
  const canSubmit = !busy && validCount && equipmentComplete && price !== null;

  function toggle(id: string) {
    setChosen((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = { equipment: "own", hire_size: "" };
      return next;
    });
  }
  function update(id: string, patch: Partial<Choice>) {
    setChosen((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/private-bookings/${bookingId}/add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          added_places: added,
          places: isBirthday
            ? []
            : ids.map((id) => ({
                participant_id: id,
                equipment: chosen[id].equipment,
                ...(chosen[id].equipment === "hire" ? { hire_size: chosen[id].hire_size } : {}),
              })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkout_url) {
        window.location.href = body.checkout_url;
        return;
      }
      setError(
        body.error === "waiver_required"
          ? "Every skater needs a signed waiver before they can be added."
          : body.error ?? "Could not add skaters — please try again."
      );
    } catch {
      setError("Could not add skaters — please try again.");
    }
    setBusy(false);
  }

  if (maxMore < 1) {
    return <p className="mt-2 text-sm text-mid">This booking is at its maximum number of skaters.</p>;
  }

  return (
    <div className="mt-3 space-y-4 text-sm">
      {isBirthday ? (
        <div>
          <label htmlFor="add-count" className="block font-bold text-mid">
            How many more skaters?
          </label>
          <input
            id="add-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxMore}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="mt-1 w-32 rounded-xl border border-line bg-white px-3 py-2 text-black"
          />
          {!validCount && count !== "" && (
            <p role="alert" className="mt-1 font-bold text-red-dark">Enter a number from 1 to {maxMore}.</p>
          )}
          <p className="mt-1 text-mid">
            {formatPrice(type.unit_price_pence ?? 0)} each, equipment included. Guests register on your invite link.
          </p>
        </div>
      ) : household.length === 0 ? (
        <p className="text-mid">
          Everyone in your household is already on this booking.{" "}
          <Link href="/account#household" className="underline">Add someone to your household</Link> first.
        </p>
      ) : (
        <ul className="space-y-3">
          {household.map((s) => (
            <li key={s.id} className="rounded-xl bg-white p-3">
              <label className="flex items-center gap-2 font-bold text-black">
                <input
                  type="checkbox"
                  checked={!!chosen[s.id]}
                  disabled={!s.waiverSigned}
                  onChange={() => toggle(s.id)}
                />
                {s.name}
                {!s.waiverSigned && <span className="font-normal text-mid"> — needs a waiver</span>}
              </label>
              {chosen[s.id] && (
                <div className="mt-2 space-y-2">
                  <select
                    aria-label={`${s.name} equipment`}
                    value={chosen[s.id].equipment}
                    onChange={(e) => update(s.id, { equipment: e.target.value as Equipment, hire_size: "" })}
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                  >
                    {EQUIPMENT.map((e) => (
                      <option key={e} value={e}>
                        {EQUIPMENT_OPTION_LABELS[e]}
                        {isHired(e) ? ` — ${formatPrice(type.hire_price_pence ?? 0)}` : ""}
                      </option>
                    ))}
                  </select>
                  {chosen[s.id].equipment === "hire" && (
                    <select
                      aria-label={`${s.name} hire size`}
                      value={chosen[s.id].hire_size}
                      onChange={(e) => update(s.id, { hire_size: e.target.value as HireSize })}
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                    >
                      <option value="">Choose a size</option>
                      {HIRE_SIZES.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {price !== null && equipmentComplete && (
        <p className="font-bold text-black">
          Adding {added} {added === 1 ? "skater" : "skaters"}: {formatPrice(price)}
        </p>
      )}
      {error && <p role="alert" className="font-bold text-red-dark">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Starting payment…" : "Add and pay"}
      </button>
    </div>
  );
}
