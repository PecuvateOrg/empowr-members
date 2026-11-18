"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPen } from "lucide-react";
import { Button, FormNotice, Input, Label, Textarea } from "@/components/ui/form";

type Candidate = { id: string; name: string; accountName: string; ageEligible: boolean; waiverSigned: boolean; alreadyBooked: boolean };

export function AdminReplaceAttendee({ bookingId, participantName }: { bookingId: string; participantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [originalId, setOriginalId] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true); setError(null); setSelected(null); setResults([]); setSearched(false);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/replace-attendee?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not search members.");
      setResults(body.results); setOriginalId(body.original_participant_id); setSearched(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not search members."); }
    finally { setBusy(false); }
  }

  async function replace() {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/replace-attendee`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: selected.id, expected_participant_id: originalId, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not replace attendee.");
      setOpen(false); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not replace attendee."); }
    finally { setBusy(false); }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 ml-4 inline-flex items-center gap-1.5 text-sm font-bold text-blue underline"><UserRoundPen className="h-4 w-4" aria-hidden />Replace attendee</button>;
  return <div className="mt-4 space-y-3 rounded-xl border border-line bg-card p-4">
    <p className="font-bold text-black">Who attended instead of {participantName}?</p>
    <p className="text-sm text-mid">For sessions that have started. The selected member will be marked attended using their own safety details. The original purchaser keeps the payment and booking history. No payment or refund is made.</p>
    <div><Label htmlFor={`replacement-search-${bookingId}`}>Find existing member</Label>
      <Input id={`replacement-search-${bookingId}`} value={query} maxLength={100} disabled={busy} onChange={e => { setQuery(e.target.value); setSelected(null); setResults([]); setSearched(false); }} />
    </div>
    <Button variant="secondary" onClick={search} disabled={busy || query.trim().length < 2}>Search members</Button>
    {searched && !results.length && <p className="text-sm text-mid">No matching members found.</p>}
    {results.length > 0 && <fieldset className="space-y-2"><legend className="font-bold">Choose the member who attended</legend>
      {results.map(person => <label key={person.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
        <input type="radio" name={`replacement-${bookingId}`} checked={selected?.id === person.id} disabled={busy || !person.ageEligible || !person.waiverSigned || person.alreadyBooked} onChange={() => setSelected(person)} />
        <span><strong>{person.name}</strong> · Account: {person.accountName}
          <span className="block text-mid">{person.alreadyBooked ? "Already booked" : !person.ageEligible ? "Outside session age range" : !person.waiverSigned ? "Needs their own signed waiver" : "Waiver on file"}</span>
        </span>
      </label>)}
    </fieldset>}
    {selected && <>
      <p className="text-sm text-mid">Replace {participantName} with {selected.name} and mark {selected.name} attended. Confirm any skate hire fits the replacement attendee; hire reservations stay unchanged. For children, use their own parent or guardian’s departure consent.</p>
      <Label htmlFor={`replacement-reason-${bookingId}`}>Reason for correction</Label>
      <Textarea id={`replacement-reason-${bookingId}`} value={reason} maxLength={300} disabled={busy} onChange={e => setReason(e.target.value)} />
      <Button onClick={replace} disabled={busy || reason.trim().length < 3}>{busy ? "Saving…" : "Confirm replacement"}</Button>
    </>}
    {error && <FormNotice tone="error">{error}</FormNotice>}
    <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
  </div>;
}
