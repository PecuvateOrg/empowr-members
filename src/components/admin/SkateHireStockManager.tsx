"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";

type SizeRow = { size: number; quantity: number };
type JamDate = { id: string; starts_at: string; reserved: Record<string, number> };

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function SkateHireStockManager() {
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [dates, setDates] = useState<JamDate[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/admin/skate-hire");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSizes(body.sizes);
      setDates(body.dates);
      setDraft(Object.fromEntries(body.sizes.map((s: SizeRow) => [s.size, String(s.quantity)])));
      setLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load skate hire stock."); }
  }
  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/skate-hire", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: sizes.map((s) => ({ size: s.size, quantity: Number(draft[s.size]) })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSizes(body.sizes);
      setDraft(Object.fromEntries(body.sizes.map((s: SizeRow) => [s.size, String(s.quantity)])));
      setSuccess("Stock saved. Members see the new counts straight away.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save skate hire stock."); }
    finally { setBusy(false); }
  }

  const total = sizes.reduce((sum, s) => sum + s.quantity, 0);

  return <div className="space-y-6">
    <div aria-live="polite">{error && <FormNotice tone="error">{error}</FormNotice>}{success && <FormNotice tone="success">{success}</FormNotice>}</div>
    {!loaded ? <div role="status">{error ? <Button onClick={load}>Retry loading</Button> : "Loading skate hire stock…"}</div> : <>
      <form onSubmit={save} className="space-y-5 rounded-2xl bg-card p-6 shadow-sm">
        <h2 className="text-xl font-extrabold">Pairs owned</h2>
        <fieldset disabled={busy} className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {sizes.map((s) => <div key={s.size}>
              <Label htmlFor={`size-${s.size}`}>UK {s.size}</Label>
              <Input id={`size-${s.size}`} type="number" inputMode="numeric" min={0} max={100} step={1} required
                value={draft[s.size] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [s.size]: e.target.value }))} />
            </div>)}
          </div>
          <p className="text-sm text-mid">{total} pairs in total. The same pairs are used at every Skate Jam, so each date can book up to these numbers. A size set to 0 is not offered.</p>
          <Button type="submit">{busy ? "Saving…" : "Save stock"}</Button>
        </fieldset>
      </form>
      <section className="space-y-3" aria-labelledby="dates-heading">
        <h2 id="dates-heading" className="text-xl font-extrabold">Booked at upcoming Skate Jams</h2>
        {dates.length === 0 && <p className="rounded-2xl bg-card p-6 text-mid">No upcoming Skate Jam dates.</p>}
        {dates.map((d) => <article key={d.id} className="rounded-2xl bg-card p-5 shadow-sm">
          <h3 className="font-black">{dateLabel(d.starts_at)}</h3>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {sizes.map((s) => {
              const booked = d.reserved[s.size] ?? 0;
              const over = booked > s.quantity;
              return <li key={s.size} className={over ? "font-bold text-red-dark" : ""}>
                UK {s.size}: {booked} of {s.quantity}{over ? " (over, find a pair)" : ""}
              </li>;
            })}
          </ul>
        </article>)}
      </section>
    </>}
  </div>;
}
