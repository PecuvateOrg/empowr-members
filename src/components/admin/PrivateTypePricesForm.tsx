"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KIND_LABELS, type PrivateBookingType } from "@/lib/private-bookings";

const input = "w-24 rounded-xl border border-line bg-white px-3 py-2 text-black";

const toPounds = (p: number | null) => (p === null ? "" : (p / 100).toFixed(2).replace(/\.00$/, ""));
const toPence = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
const toInt = (v: string) => (v.trim() === "" ? null : Number(v));

const UNIT: Record<string, string> = {
  birthday: "per skater",
  coaching_one: "per hour",
  coaching_group: "per skater per hour",
};

export function PrivateTypePricesForm({ type }: { type: PrivateBookingType }) {
  const router = useRouter();
  const [price, setPrice] = useState(toPounds(type.unit_price_pence));
  const [hire, setHire] = useState(toPounds(type.hire_price_pence));
  const [min, setMin] = useState(String(type.min_places));
  const [max, setMax] = useState(type.max_places === null ? "" : String(type.max_places));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const hasHire = type.kind !== "birthday"; // party places include equipment
  const fixedSize = type.kind === "coaching_one";

  async function submit() {
    const unit = toPence(price);
    if (unit === null || Number.isNaN(unit)) {
      setMessage({ ok: false, text: "Enter a price." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/private-bookings/types/${type.kind}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unit_price_pence: unit,
          hire_price_pence: hasHire ? toPence(hire) : type.hire_price_pence,
          min_places: fixedSize ? type.min_places : Number(min),
          max_places: fixedSize ? type.max_places : toInt(max),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: "Saved — new bookings use this now." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: body.error ?? "Could not save." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-wrap items-end gap-3 py-3 text-sm"
    >
      <p className="w-full font-bold text-black sm:w-48">{KIND_LABELS[type.kind]}</p>
      <label className="flex flex-col gap-1 font-bold text-mid">
        Price £ ({UNIT[type.kind]})
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
      </label>
      {hasHire && (
        <label className="flex flex-col gap-1 font-bold text-mid">
          Equipment hire £
          <input inputMode="decimal" value={hire} onChange={(e) => setHire(e.target.value)} className={input} />
        </label>
      )}
      {!fixedSize && (
        <>
          <label className="flex flex-col gap-1 font-bold text-mid">
            Min skaters
            <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 font-bold text-mid">
            Max skaters
            <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} className={input} />
          </label>
        </>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-blue px-5 py-2 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className="w-full text-black">
          {message.text}
        </p>
      )}
    </form>
  );
}
