"use client";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button, FormNotice, Input } from "@/components/ui/form";

type Target = { occurrence_id: string; when: string; places_left: number | null };

export function AdminTransferBooking({ bookingId, participantName }: {
  bookingId: string; participantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [reason, setReason] = useState("Booked the wrong date");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load() {
    setOpen(true); setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/transfer`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load dates.");
      setTargets(body.targets ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load dates."); }
    finally { setBusy(false); }
  }

  async function transfer() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/transfer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrence_id: chosen, reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not transfer booking.");
      setDone(body.when); setTargets(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not transfer booking."); }
    finally { setBusy(false); }
  }

  if (done) return <FormNotice tone="success">Moved to {done}. {participantName}&apos;s member account has been updated.</FormNotice>;
  if (!open) return <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-blue underline"><CalendarClock className="h-4 w-4" aria-hidden />Transfer booking</button>;

  return <div className="mt-4 space-y-3 rounded-xl border border-line bg-card p-4">
    <p className="font-bold text-black">Transfer {participantName} to another date</p>
    <p className="text-sm text-mid">Admin transfers can be made after the original date and more than once. No payment is taken.</p>
    {busy && targets === null && <p className="text-sm text-mid">Loading dates…</p>}
    {targets?.length === 0 && <FormNotice tone="error">No upcoming dates have space.</FormNotice>}
    {!!targets?.length && <fieldset className="space-y-2"><legend className="sr-only">New date</legend>{targets.map(target =>
      <label key={target.occurrence_id} className="flex cursor-pointer gap-2 rounded-lg border border-line p-3 text-sm">
        <input type="radio" name={`admin-transfer-${bookingId}`} checked={chosen === target.occurrence_id} onChange={() => setChosen(target.occurrence_id)} />
        <span className="flex-1 font-semibold">{target.when}</span>
        {target.places_left !== null && <span>{target.places_left} left</span>}
      </label>)}</fieldset>}
    <Input label="Reason for transfer" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
    {error && <FormNotice tone="error">{error}</FormNotice>}
    <div className="flex flex-wrap gap-2"><Button onClick={transfer} disabled={busy || !chosen || reason.trim().length < 3}>{busy ? "Moving…" : "Move booking"}</Button><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button></div>
  </div>;
}
