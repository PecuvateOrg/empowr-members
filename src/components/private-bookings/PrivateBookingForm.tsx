"use client";

// Customer private-booking form. Everything shown here — which times are
// open, the total — mirrors the database; the hold re-checks all of it and
// snapshots its own price, so this form can be wrong only in what it offers,
// never in what it charges.
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, TriangleAlert } from "lucide-react";
import { formatPrice } from "@/lib/format";
import {
  COACHING_SAFETY,
  HIRE_SIZES,
  KIND_LABELS,
  formatPrivateSlot,
  privateBookingPrice,
  totalPlaces,
  type AvailableSlot,
  type HireSize,
  type OnlineKind,
  type PrivateBookingType,
} from "@/lib/private-bookings";

type Participant = { id: string; name: string; waiverSigned: boolean };
type Place = { participant_id: string; equipment: "own" | "hire"; hire_size: HireSize | "" };

const emptyPlace = (): Place => ({ participant_id: "", equipment: "own", hire_size: "" });

export function PrivateBookingForm({
  types,
  slots,
  participants,
  initialKind,
}: {
  types: (PrivateBookingType & { kind: OnlineKind })[];
  slots: AvailableSlot[];
  participants: Participant[];
  initialKind: OnlineKind;
}) {
  const [kind, setKind] = useState<OnlineKind>(initialKind);
  const type = types.find((t) => t.kind === kind)!;
  const isCoaching = kind !== "birthday";
  const [hours, setHours] = useState<1 | 2>(kind === "birthday" ? 2 : 1);
  const [paidPlaces, setPaidPlaces] = useState(type.min_places);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>(() =>
    Array.from({ length: initialKind === "birthday" ? 0 : type.min_places }, emptyPlace)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsigned, setUnsigned] = useState<string[]>([]);

  const effectiveHours: 1 | 2 = kind === "birthday" ? 2 : hours;
  const open = useMemo(
    () => slots.filter((s) => s.kind === kind && s.hours === effectiveHours),
    [slots, kind, effectiveHours]
  );

  function chooseKind(next: OnlineKind) {
    const nextType = types.find((t) => t.kind === next)!;
    setKind(next);
    setHours(next === "birthday" ? 2 : 1);
    setPaidPlaces(nextType.min_places);
    setPlaces(Array.from({ length: next === "birthday" ? 0 : nextType.min_places }, emptyPlace));
    setStartsAt(null);
    setError(null);
  }

  function changeCount(value: number) {
    const min = type.min_places;
    const max = type.max_places ?? 200;
    const count = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
    setPaidPlaces(count);
    if (isCoaching) {
      setPlaces((current) =>
        Array.from({ length: count }, (_, i) => current[i] ?? emptyPlace())
      );
    }
  }

  function updatePlace(index: number, patch: Partial<Place>) {
    setPlaces((current) => current.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  const hireCount = places.filter((p) => p.equipment === "hire").length;
  const price = privateBookingPrice(type, effectiveHours, paidPlaces, isCoaching ? hireCount : 0);
  const chosenIds = places.map((p) => p.participant_id).filter(Boolean);
  const placesComplete =
    !isCoaching ||
    (places.every((p) => p.participant_id && (p.equipment === "own" || p.hire_size)) &&
      new Set(chosenIds).size === chosenIds.length);
  const canSubmit = !busy && startsAt !== null && placesComplete;

  async function submit() {
    if (!canSubmit || !startsAt) return;
    setBusy(true);
    setError(null);
    setUnsigned([]);
    try {
      const res = await fetch("/api/private-bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          starts_at: startsAt,
          hours: effectiveHours,
          paid_places: paidPlaces,
          places: isCoaching
            ? places.map((p) => ({
                participant_id: p.participant_id,
                equipment: p.equipment,
                ...(p.equipment === "hire" ? { hire_size: p.hire_size } : {}),
              }))
            : [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkout_url) {
        window.location.assign(body.checkout_url);
        return;
      }
      if (body.error === "waiver_required") {
        setUnsigned((body.unsigned ?? []).map((u: { name: string }) => u.name));
        setError("A signed waiver is needed for every skater before booking.");
      } else {
        setError(body.error ?? "Something went wrong — please try again.");
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-6"
    >
      <fieldset>
        <legend className="font-extrabold text-black">What would you like to book?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {types.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => chooseKind(t.kind)}
              aria-pressed={kind === t.kind}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                kind === t.kind ? "border-blue bg-blue-pale/50 text-black" : "border-line bg-white text-mid"
              }`}
            >
              {KIND_LABELS[t.kind]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-mid">
          {kind === "birthday" &&
            `${formatPrice(type.unit_price_pence ?? 0)} per skater, minimum ${type.min_places} skaters, plus one free place for the birthday person. Skate hire included. 3–5pm.`}
          {kind === "coaching_one" &&
            `${formatPrice(type.unit_price_pence ?? 0)} per hour for one skater. Skate hire with pads and helmet ${formatPrice(type.hire_price_pence ?? 0)}.`}
          {kind === "coaching_group" &&
            `${formatPrice(type.unit_price_pence ?? 0)} per skater per hour, minimum ${type.min_places} skaters. Skate hire with pads and helmet ${formatPrice(type.hire_price_pence ?? 0)} per skater.`}
        </p>
      </fieldset>

      {isCoaching && (
        <fieldset>
          <legend className="font-extrabold text-black">How long?</legend>
          <div className="mt-3 flex gap-2">
            {([1, 2] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setHours(h);
                  setStartsAt(null);
                }}
                aria-pressed={hours === h}
                className={`rounded-full border px-5 py-2 text-sm font-bold ${
                  hours === h ? "border-blue bg-blue-pale/50 text-black" : "border-line bg-white text-mid"
                }`}
              >
                {h === 1 ? "1 hour" : "2 hours"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {kind !== "coaching_one" && (
        <div>
          <label htmlFor="paid-places" className="font-extrabold text-black">
            {kind === "birthday" ? "Number of skaters (not counting the birthday person)" : "Number of skaters"}
          </label>
          <input
            id="paid-places"
            type="number"
            min={type.min_places}
            max={type.max_places ?? undefined}
            value={paidPlaces}
            onChange={(e) => changeCount(Number(e.target.value))}
            className="mt-2 block w-32 rounded-xl border border-line bg-white px-4 py-3 text-black"
          />
          {kind === "birthday" && (
            <p className="mt-2 text-sm text-mid">
              {totalPlaces(kind, paidPlaces)} places in total, including the birthday person.
            </p>
          )}
        </div>
      )}

      <fieldset>
        <legend className="flex items-center gap-2 font-extrabold text-black">
          <CalendarDays className="h-4 w-4 text-blue" aria-hidden /> Choose a date
        </legend>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-mid">
            No dates are open for this option right now. Try another length or type of booking.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {open.map((slot) => (
              <button
                key={slot.starts_at}
                type="button"
                onClick={() => setStartsAt(slot.starts_at)}
                aria-pressed={startsAt === slot.starts_at}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                  startsAt === slot.starts_at
                    ? "border-blue bg-blue-pale/50 text-black"
                    : "border-line bg-white text-mid"
                }`}
              >
                {formatPrivateSlot(slot.starts_at, slot.ends_at)}
              </button>
            ))}
          </div>
        )}
        {isCoaching && hours === 1 && (
          <p className="mt-2 text-xs text-mid">
            One-hour sessions start at 3pm. 4–5pm opens once 3–4pm is booked for coaching that day.
          </p>
        )}
      </fieldset>

      {isCoaching && (
        <fieldset className="space-y-4">
          <legend className="font-extrabold text-black">Skaters and equipment</legend>
          {participants.length === 0 ? (
            <p className="text-sm text-mid">
              Add the skaters to your household first.{" "}
              <Link href="/account" className="underline">Go to your account</Link>
            </p>
          ) : (
            places.map((place, i) => (
              <div key={i} className="rounded-xl border border-line bg-white p-4">
                <p className="text-sm font-extrabold text-black">Skater {i + 1}</p>
                <label className="mt-2 block text-sm font-bold text-mid" htmlFor={`skater-${i}`}>
                  Who
                </label>
                <select
                  id={`skater-${i}`}
                  value={place.participant_id}
                  onChange={(e) => updatePlace(i, { participant_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                >
                  <option value="">Choose a skater</option>
                  {participants.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={!p.waiverSigned || (chosenIds.includes(p.id) && place.participant_id !== p.id)}
                    >
                      {p.name}
                      {!p.waiverSigned ? " — needs a waiver" : ""}
                    </option>
                  ))}
                </select>
                <label className="mt-3 block text-sm font-bold text-mid" htmlFor={`equipment-${i}`}>
                  Equipment
                </label>
                <select
                  id={`equipment-${i}`}
                  value={place.equipment}
                  onChange={(e) =>
                    updatePlace(i, {
                      equipment: e.target.value as Place["equipment"],
                      hire_size: e.target.value === "hire" ? place.hire_size : "",
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                >
                  <option value="own">Bringing own quad skates and protective gear</option>
                  <option value="hire">
                    Skate hire with pads and helmet — {formatPrice(type.hire_price_pence ?? 0)}
                  </option>
                </select>
                {place.equipment === "hire" && (
                  <>
                    <label className="mt-3 block text-sm font-bold text-mid" htmlFor={`size-${i}`}>
                      Hire size
                    </label>
                    <select
                      id={`size-${i}`}
                      value={place.hire_size}
                      onChange={(e) => updatePlace(i, { hire_size: e.target.value as HireSize })}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                    >
                      <option value="">Choose a size</option>
                      {HIRE_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            ))
          )}
          {participants.some((p) => !p.waiverSigned) && (
            <p className="text-sm text-mid">
              Skaters without a signed waiver can’t be booked yet.{" "}
              <Link href="/waiver" className="underline">Complete a waiver</Link>
            </p>
          )}
          <div className="space-y-1 text-sm text-mid">
            {COACHING_SAFETY.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </fieldset>
      )}

      {kind === "birthday" && (
        <p className="rounded-xl bg-blue-pale/40 p-4 text-sm text-black">
          After you pay, you’ll get a link to share with your guests. Each parent registers their
          child, completes the waiver and chooses a skate size. Sizes are needed two weeks before
          the party.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-lg font-black text-black">
          {price ? `Total ${formatPrice(price.totalPence)}` : ""}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "Starting payment…" : "Continue to payment"}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-line bg-white p-4 text-sm text-black">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden />
          <div>
            <p>{error}</p>
            {unsigned.length > 0 && (
              <p className="mt-1">
                {unsigned.join(", ")} —{" "}
                <Link href="/waiver" className="underline">complete a waiver</Link>
              </p>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
