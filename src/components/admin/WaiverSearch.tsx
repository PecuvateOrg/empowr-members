"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { WaiverBadge } from "@/components/admin/ParticipantSafetyInfo";
import type { WaiverSearchResult } from "@/lib/waiver-search";

const SOURCE_LABELS: Record<WaiverSearchResult["source"], string> = {
  member: "Members account",
  waiver_site: "Waiver site",
};

export function WaiverSearch() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<WaiverSearchResult[] | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/waivers/search?q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResults(null);
        setError(body.error ?? "Could not search waivers.");
        return;
      }
      setResults(body.results ?? []);
    } catch {
      setResults(null);
      setError("Could not search waivers.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label htmlFor="waiver-q">Skater name, or parent&apos;s name or email</Label>
          <Input id="waiver-q" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Sam Smith" />
        </div>
        <Button type="submit" disabled={busy || q.trim().length < 3}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {error && <FormNotice tone="error">{error}</FormNotice>}

      {results !== null &&
        (results.length === 0 ? (
          <p className="rounded-xl bg-red-soft p-3 text-sm font-bold text-red-dark">
            No one matches that search — treat them as not signed.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {results.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="text-base font-extrabold text-black">{r.skaterName}</p>
                  <p className="text-mid">
                    {SOURCE_LABELS[r.source]}
                    {r.contactName ? ` · ${r.contactName}` : ""}
                    {r.contactEmail ? ` (${r.contactEmail})` : ""}
                    {r.signedAt ? ` · signed ${format(parseISO(r.signedAt), "d MMM yyyy")}` : ""}
                  </p>
                </div>
                <WaiverBadge signed={r.signed} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
