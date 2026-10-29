"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import type { Discount } from "@/lib/discounts";

type Offering = { id: string; title: string; active: boolean };
const selectClass = "w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black";

export function DiscountManager() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [kind, setKind] = useState("percentage");
  const [scope, setScope] = useState("all");

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/admin/discounts");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDiscounts(body.discounts);
      setOfferings(body.offerings);
      setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load discount codes."); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const value = Number(fields.get("value"));
    setBusy(true); setError(""); setSuccess("");
    try {
      const expires = String(fields.get("expires") ?? "");
      const response = await fetch("/api/admin/discounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fields.get("code"), kind, value: kind === "fixed" ? Math.round(value * 100) : value,
          offering_id: scope === "all" ? null : fields.get("offering"),
          expires_at: expires ? new Date(expires).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDiscounts((previous) => [body.discount, ...previous]);
      setSuccess(`Code ${body.discount.code} created.`);
      form.reset(); setKind("percentage"); setScope("all");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create discount code."); }
    finally { setBusy(false); }
  }

  async function toggle(discount: Discount) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/discounts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: discount.id, active: !discount.active }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDiscounts((previous) => previous.map((row) => row.id === discount.id ? body.discount : row));
      setSuccess(`Code ${discount.code} ${body.discount.active ? "activated" : "paused"}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update discount code."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    <div aria-live="polite">{error && <FormNotice tone="error">{error}</FormNotice>}{success && <FormNotice tone="success">{success}</FormNotice>}</div>
    {!loaded ? <div role="status">{error ? <Button onClick={load}>Retry loading</Button> : "Loading discount codes…"}</div> : <>
      <form onSubmit={create} className="space-y-5 rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="text-xl font-extrabold">Create a discount code</h2>
        <fieldset disabled={busy} className="space-y-5">
          <div><Label htmlFor="code">Code</Label><Input id="code" name="code" placeholder="SUMMER20" minLength={3} maxLength={40} pattern="[A-Za-z0-9_-]+" required autoComplete="off" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="kind">Discount type</Label><select id="kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off each place</option></select></div>
            <div><Label htmlFor="value">{kind === "percentage" ? "Percentage (%)" : "Amount per place (£)"}</Label><Input key={kind} id="value" name="value" type="number" min={kind === "percentage" ? 1 : 0.01} max={kind === "percentage" ? 100 : 1000000} step={kind === "percentage" ? 1 : 0.01} required /></div>
          </div>
          <div><Label htmlFor="scope">Applies to</Label><select id="scope" className={selectClass} value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">All sessions</option><option value="offering">One session type</option></select></div>
          {scope === "offering" && <div><Label htmlFor="offering">Session type</Label><select id="offering" name="offering" className={selectClass} defaultValue="" required><option value="" disabled>Choose a session type</option>{offerings.filter((o) => o.active).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select><p className="mt-1 text-sm text-mid">Applies to every date of this session type.</p></div>}
          <div><Label htmlFor="expires">Expires at (optional, your local time)</Label><Input id="expires" name="expires" type="datetime-local" /></div>
          <p className="text-sm text-mid">One code per basket. Discounts apply to each eligible place, including early bird tickets, before any account credit. Subscriptions and private bookings are excluded.</p>
          <Button type="submit">{busy ? "Saving…" : "Create code"}</Button>
        </fieldset>
      </form>
      <section className="space-y-3" aria-labelledby="codes-heading">
        <h2 id="codes-heading" className="text-xl font-extrabold">Your discount codes</h2>
        {discounts.length === 0 && <p className="rounded-2xl bg-card p-6 text-mid">No discount codes yet. Create your first code above.</p>}
        {discounts.map((discount) => {
          const expired = !!discount.expires_at && Date.parse(discount.expires_at) <= Date.now();
          return <article key={discount.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-5 shadow-sm">
            <div className="min-w-0"><h3 className="break-all text-lg font-black">{discount.code}</h3>
              <p className="font-bold">{discount.kind === "percentage" ? `${discount.value}% off` : `${formatPrice(discount.value)} off each place`}</p>
              <p className="text-sm text-mid">{discount.offering_id ? offerings.find((o) => o.id === discount.offering_id)?.title ?? "Selected session type" : "All sessions"}</p>
              <p className="text-sm text-mid">{expired ? "Expired" : discount.active ? "Active" : "Paused"} · {discount.expires_at ? `Expires ${new Date(discount.expires_at).toLocaleString("en-GB")}` : "No expiry"}</p>
            </div>
            {!expired && <Button variant="secondary" disabled={busy} onClick={() => toggle(discount)} aria-label={`${discount.active ? "Pause" : "Activate"} ${discount.code}`}>{discount.active ? "Pause" : "Activate"}</Button>}
          </article>;
        })}
      </section>
    </>}
  </div>;
}
