"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";

type ArchivedWaiver = {
  id: string;
  skater_name: string;
  signer_name: string | null;
  signer_email: string | null;
  has_minors: boolean | null;
  agreed_tc: boolean | null;
  agreed_waiver: boolean | null;
  agreed_photo: boolean | null;
  form_version_id: string | null;
  signed_at: string | null;
  archived_at: string;
  purge_after: string;
};

const day = (iso: string | null) => (iso ? format(parseISO(iso), "d MMM yyyy") : "—");
const yesNo = (v: boolean | null) => (v ? "Yes" : v === false ? "No" : "—");

export function WaiverArchiveSearch() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ArchivedWaiver[] | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/waiver-archive?q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResults(null);
        setError(body.error ?? "Could not search the archive.");
        return;
      }
      setResults(body.results ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label htmlFor="archive-q">Skater name or signer email</Label>
          <Input id="archive-q" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Sam Smith" />
        </div>
        <Button type="submit" disabled={busy || q.trim().length < 3}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {error && <FormNotice tone="error">{error}</FormNotice>}

      {results !== null &&
        (results.length === 0 ? (
          <p className="text-mid">No archived waivers match that search.</p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-white p-4 text-sm">
                <p className="text-base font-extrabold text-black">{r.skater_name}</p>
                <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div><dt className="inline text-muted">Signed by: </dt><dd className="inline">{r.signer_name ?? "—"} ({r.signer_email ?? "no email"})</dd></div>
                  <div><dt className="inline text-muted">Signed: </dt><dd className="inline">{day(r.signed_at)}</dd></div>
                  <div><dt className="inline text-muted">Terms / waiver / photo: </dt><dd className="inline">{yesNo(r.agreed_tc)} / {yesNo(r.agreed_waiver)} / {yesNo(r.agreed_photo)}</dd></div>
                  <div><dt className="inline text-muted">Covered a minor: </dt><dd className="inline">{yesNo(r.has_minors)}</dd></div>
                  <div><dt className="inline text-muted">Removed from household: </dt><dd className="inline">{day(r.archived_at)}</dd></div>
                  <div><dt className="inline text-muted">Deleted automatically: </dt><dd className="inline">{day(r.purge_after)}</dd></div>
                  <div className="sm:col-span-2"><dt className="inline text-muted">Waiver wording version: </dt><dd className="inline font-mono text-xs">{r.form_version_id ?? "—"}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
