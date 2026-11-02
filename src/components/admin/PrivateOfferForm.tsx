"use client";
import { useState } from "react";
import { londonSlotIso, equipmentDeadline, type PrivateBookingType } from "@/lib/private-bookings";
import { formatPrice } from "@/lib/format";
import { offerDeadline, OFFER_LATE_HIRE_MESSAGE } from "@/lib/private-offers";

export function PrivateOfferForm({ type }: { type: PrivateBookingType }) {
  const [date, setDate] = useState("");
  const [places, setPlaces] = useState(type.min_places);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const startsAt = date ? londonSlotIso(date, 15) : null;
  const input = "rounded-xl border border-line bg-white px-3 py-2 text-black";
  return <section className="space-y-4 rounded-2xl bg-card p-6 shadow-sm">
    <h2 className="text-xl font-extrabold">Create a private birthday offer</h2>
    <p className="text-sm text-mid">For an available Saturday less than two weeks away. Copy the link into your email to the customer. They can create an account before paying. Creating the link does not hold the date.</p>
    {!type.active && <p role="alert">Birthday bookings are currently switched off.</p>}
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(""); setResult(null); setCopied(false);
      try {
        const response = await fetch("/api/admin/private-bookings/offers", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ starts_at: startsAt, paid_places: places }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not create the offer.");
        setResult(data);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create the offer."); }
      finally { setBusy(false); }
    }}>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 font-bold">Saturday (3–5pm)<input required type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="flex flex-col gap-1 font-bold">Paid places<input required type="number" className={input} min={type.min_places} max={type.max_places === null ? undefined : type.max_places - 1} value={places} onChange={e => setPlaces(Number(e.target.value))} /></label>
      </div>
      <p>{places + 1} total places including the birthday person · {formatPrice((type.unit_price_pence ?? 0) * places)}</p>
      {startsAt && <p>Skate sizes due {equipmentDeadline(startsAt, 7)}. {Date.parse(startsAt) - 7 * 86400000 <= Date.now() && OFFER_LATE_HIRE_MESSAGE}</p>}
      <p className="text-sm text-mid">Payment is due 48 hours after creating the link. Customers must start a new checkout at least 31 minutes before expiry or the party start.</p>
      <button disabled={busy || !type.active} className="rounded-full bg-blue px-5 py-3 font-extrabold text-white disabled:opacity-50">{busy ? "Creating…" : "Create offer link"}</button>
    </form>
    {error && <p role="alert" className="text-red-dark">{error}</p>}
    {result && <div className="space-y-3" role="status">
      <p>Created. Payment due {offerDeadline(result.expires_at)}.</p>
      <label className="block font-bold">Link to send<input className={`${input} mt-2 w-full`} readOnly value={result.url} onFocus={e => e.target.select()} /></label>
      <button type="button" className="font-bold text-blue underline" onClick={async () => {
        try { await navigator.clipboard.writeText(result.url); setCopied(true); }
        catch { setError("Select and copy the link above."); }
      }}>{copied ? "Copied" : "Copy link"}</button>
    </div>}
  </section>;
}
