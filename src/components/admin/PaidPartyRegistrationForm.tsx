"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { londonSlotIso } from "@/lib/private-bookings";
import { CopyLink } from "@/components/private-bookings/CopyLink";

export function PaidPartyRegistrationForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [paidPlaces, setPaidPlaces] = useState(10);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const input = "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black";
  return <section className="space-y-4">
    <h3 className="text-lg font-extrabold">Already paid, but the organiser has no account</h3>
    <p className="text-sm text-mid">Save the party and send the organiser their setup link. They will create a free account using the email below, add their child and access the guest registration and waiver link. There is no payment step.</p>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      const id = requestId ?? crypto.randomUUID(); setRequestId(id);
      try {
        const response = await fetch("/api/admin/private-bookings/paid-registration", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ request_id: id, email, starts_at: londonSlotIso(date, 15), paid_places: paidPlaces, note, paid_confirmed: confirmed }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not save the party.");
        setUrl(body.url); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not save the party."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy || !!url} className="space-y-3">
        <label className="block font-bold">Organiser’s email<input required type="email" value={email} onChange={e => {setEmail(e.target.value); setRequestId(null);}} className={input} /></label>
        <label className="block font-bold">Party Saturday (3–5pm)<input required type="date" value={date} onChange={e => {setDate(e.target.value); setRequestId(null);}} className={input} /></label>
        <label className="block font-bold">Paid children / places<input required type="number" min={1} max={199} value={paidPlaces} onChange={e => {setPaidPlaces(Number(e.target.value)); setRequestId(null);}} className={input} /></label>
        <p className="font-bold">{paidPlaces} paid + 1 free birthday place = {paidPlaces + 1} total places.</p>
        <label className="block font-bold">Payment reference or internal note<textarea value={note} maxLength={1000} onChange={e => setNote(e.target.value)} className={input} /></label>
        <label className="flex items-start gap-2"><input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm payment has already been received. Saving reserves this date.</label>
        <button disabled={!confirmed} className="rounded-full bg-blue px-5 py-3 font-extrabold text-white disabled:opacity-50">{busy ? "Saving…" : "Save paid party and create setup link"}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="text-red-dark">{error}</p>}
    {url && <div role="status" className="space-y-3"><p>Party saved and date reserved. Send this private setup link only to the organiser. Their guest link will be separate.</p><CopyLink url={url} label="Organiser setup link" /></div>}
  </section>;
}
