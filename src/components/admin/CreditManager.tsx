"use client";
import { useState } from "react";
import { Button, Input, Label, FormNotice } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { CREDIT_EXPIRY_MONTHS } from "@/lib/business-rules";
import type { CreditBalance } from "@/lib/credits";

type Member = { id: string; name: string; phone: string | null };
type Booking = { id: string; price_paid_pence: number; participant: { name: string } | null;
  occurrence: { starts_at: string; offering: { title: string } } | null;
  course_run: { label: string; offering: { title: string } } | null };
type PendingRefund = { booking_id: string; card_pence: number; credit_pence: number };
type Records = { bookings: Booking[]; credits: CreditBalance[]; refunds: PendingRefund[] };

export function CreditManager() {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [records, setRecords] = useState<Records | null>(null);
  const [source, setSource] = useState("legacy");
  const [bookingId, setBookingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);
  const [searched, setSearched] = useState(false);
  async function readRecords(id: string) {
    const response = await fetch(`/api/admin/credits?account_id=${encodeURIComponent(id)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setRecords(body);
  }
  async function choose(value: Member) {
    setBusy(true); setRecords(null); setMember(value); setBookingId("");
    setIssued(false); setMessage(""); setRequestId(crypto.randomUUID());
    try { await readRecords(value.id); } catch { setMessage("Could not load this member. Select them again to retry."); setSuccess(false); }
    finally { setBusy(false); }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setSuccess(false);
    try {
      const response = await fetch(`/api/admin/credits?q=${encodeURIComponent(query)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMembers(body.members); setSearched(true);
    } catch { setMessage("Member search failed. Please retry."); }
    finally { setBusy(false); }
  }
  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!member || !requestId || busy || issued) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setSuccess(false);
    try {
      const response = await fetch("/api/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: member.id, request_id: requestId,
          ...(source === "booking" ? { booking_id: bookingId } : {
            platform: form.get("platform"), reference: form.get("reference"), session: form.get("session"),
            session_date: form.get("session_date"), amount_pence: Math.round(Number(form.get("amount")) * 100),
          }), reason: form.get("reason"), verified: form.get("verified") === "on", agreed: form.get("agreed") === "on" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setIssued(true); setSuccess(true);
      setMessage(`${formatPrice(body.credit.amount_pence)} credit issued to ${member.name}. Reference ${body.credit.id}. Expires ${new Date(body.credit.expires_at).toLocaleDateString("en-GB")}. The balance is visible in their account.`);
      try { await readRecords(member.id); } catch { /* Issuance succeeded; do not encourage reissue. */ }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not issue credit. Retry using this form."); }
    finally { setBusy(false); }
  }
  async function retryRefund(id: string) {
    if (!member) return;
    setBusy(true); setMessage(""); setSuccess(false);
    try {
      const response = await fetch("/api/admin/credits/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: id, account_id: member.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await readRecords(member.id); setSuccess(true); setMessage("Refund processed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Refund retry failed."); }
    finally { setBusy(false); }
  }
  const selectStyle = "w-full rounded-xl border border-line bg-card px-4 py-3 text-black";
  return <div className="space-y-6">
    <form onSubmit={search} className="space-y-3 rounded-2xl bg-card p-6">
      <Label htmlFor="member-search">Find the member by account holder name</Label>
      <Input id="member-search" value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={100} required />
      <Button disabled={busy}>Search members</Button>
      <p className="text-sm text-mid">If they booked on the old platform and do not have a Members account, ask them to register first.</p>
      <ul className="space-y-2">{members.map(m => <li key={m.id}><Button type="button" variant="secondary" disabled={busy} onClick={() => choose(m)}>{m.name} · {m.phone ?? "No phone"} · {m.id.slice(0,8)}</Button></li>)}</ul>
      {searched && members.length === 0 && <p>No matching members. Try the account holder&apos;s name.</p>}
    </form>
    <div role="status" aria-live="polite">{message && <FormNotice tone={success ? "success" : "error"}>{message}</FormNotice>}</div>
    {member && records && <>
      <section className="rounded-2xl bg-card p-6 space-y-3"><h2 className="text-xl font-extrabold">{member.name}</h2><p className="text-sm break-all">Member account: {member.id} · {member.phone ?? "No phone recorded"}</p>
        <p className="text-xl font-bold">Available credit: {formatPrice(records.credits.reduce((n,c) => n+c.available_pence,0))}</p>
        {records.credits.map(c => <div key={c.id} className="border-t border-line pt-3 text-sm"><strong>{formatPrice(c.amount_pence)} issued · {formatPrice(c.available_pence)} available</strong><p>{c.external_platform ? `${c.external_platform} / ${c.external_reference}` : `Booking ${c.source_booking_id}`}</p><p>Expires {c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-GB") : "No expiry"} · {formatPrice(c.reserved_pence)} held at checkout</p></div>)}
        {records.refunds.map(r => <div key={r.booking_id} className="border-t border-line pt-3"><p>Pending refund: {r.booking_id} · {formatPrice(r.card_pence)} card / {formatPrice(r.credit_pence)} credit</p><Button disabled={busy} onClick={() => retryRefund(r.booking_id)}>Retry approved refund</Button></div>)}
      </section>
      {!issued && <form onSubmit={issue} className="rounded-2xl bg-card p-6 space-y-4"><fieldset disabled={busy} className="space-y-4">
        <legend className="text-xl font-extrabold">Issue a credit note</legend>
        <Label htmlFor="credit-source">Original booking</Label><select id="credit-source" className={selectStyle} value={source} onChange={e => setSource(e.target.value)}><option value="legacy">Old platform / external booking</option><option value="booking">Members booking</option></select>
        {source === "booking" ? <><Label htmlFor="credit-booking">Choose the booking to cancel and credit</Label><select id="credit-booking" className={selectStyle} value={bookingId} onChange={e => setBookingId(e.target.value)} required><option value="">Choose a booking</option>{records.bookings.map(b => <option key={b.id} value={b.id}>{b.participant?.name} · {b.occurrence?.offering.title ?? b.course_run?.offering.title} · {b.occurrence ? new Date(b.occurrence.starts_at).toLocaleDateString("en-GB") : b.course_run?.label} · {formatPrice(b.price_paid_pence)} · {b.id.slice(0,8)}</option>)}</select><p className="text-sm text-mid">The full booking value is credited and its place released. No card refund is issued.</p></> : <>
          <Label htmlFor="platform">Original platform</Label><Input id="platform" name="platform" defaultValue="Wix" required maxLength={80} />
          <Label htmlFor="reference">Original booking or payment reference</Label><Input id="reference" name="reference" required maxLength={100} />
          <Label htmlFor="session">Original session</Label><Input id="session" name="session" required maxLength={200} />
          <Label htmlFor="session_date">Original session date</Label><Input id="session_date" name="session_date" type="date" required />
          <Label htmlFor="amount">Credit amount (£)</Label><Input id="amount" name="amount" type="number" min="0.01" max="10000" step="0.01" required />
          <p className="text-sm text-mid">This records the old booking as a reference. It does not change or cancel it on the old platform. Use the same original reference when checking for previous credit.</p>
        </>}
        <Label htmlFor="reason">Reason for credit</Label><Input id="reason" name="reason" required maxLength={1000} />
        <Label><input type="checkbox" name="verified" required className="mr-2" />I checked the payment and member identity, and confirmed no refund or credit has already been issued.</Label>
        <Label><input type="checkbox" name="agreed" required className="mr-2" />The member has agreed to account credit.</Label>
        <p className="text-sm text-mid">Credit expires {CREDIT_EXPIRY_MONTHS} months after issue. Members choose whether to apply it when booking a session or course.</p>
        <Button disabled={busy}>{busy ? "Issuing credit…" : source === "booking" ? "Cancel booking and issue credit" : "Issue old-platform credit"}</Button>
      </fieldset></form>}
      {issued && <Button variant="secondary" onClick={() => { setIssued(false); setRequestId(crypto.randomUUID()); setBookingId(""); setMessage(""); }}>Issue another credit note</Button>}
    </>}
  </div>;
}
