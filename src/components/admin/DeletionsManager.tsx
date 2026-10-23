"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormNotice, Input, Label, Textarea } from "@/components/ui/form";

export type DeletionListItem = {
  id: string;
  status: "pending_confirmation" | "scheduled" | "held" | "cancelled" | "reversed" | "erased";
  requested_at: string;
  confirmed_at: string | null;
  erase_after: string | null;
  ended_at: string | null;
  ended_by: string | null;
  hold_reasons: string[];
  account: { id: string; name: string; deletion_hold: boolean; deletion_hold_note: string | null } | null;
};

const STATUS: Record<DeletionListItem["status"], string> = {
  pending_confirmation: "Waiting for the member to confirm",
  scheduled: "Scheduled",
  held: "ON HOLD",
  cancelled: "Cancelled by the member",
  reversed: "Reversed by staff",
  erased: "Erased",
};
const REASON: Record<string, string> = {
  staff_hold: "staff hold",
  stripe_dispute: "open Stripe dispute",
  stripe_unchecked: "Stripe could not be checked",
  refund_in_progress: "refund still settling",
  recent_session: "session in the last 7 days",
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "—");

export function DeletionsManager({ items }: { items: DeletionListItem[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function post(url: string, body: unknown, ok: string, key: string) {
    setBusy(key);
    setNotice(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    setNotice(res.ok ? { tone: "success", message: ok } : { tone: "error", message: json.error ?? "Something went wrong." });
    if (res.ok) router.refresh();
  }

  const open = items.filter((i) => ["pending_confirmation", "scheduled", "held"].includes(i.status));
  const closed = items.filter((i) => !open.includes(i));

  return (
    <div className="space-y-8">
      {notice && <FormNotice tone={notice.tone}>{notice.message}</FormNotice>}

      <section className="space-y-3">
        <h2 className="text-xl font-extrabold text-black">Open requests</h2>
        {open.length === 0 && <p className="text-sm text-mid">None.</p>}
        {open.map((i) => (
          <article key={i.id} id={i.id} className="rounded-2xl bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="font-extrabold text-black">{i.account?.name ?? "—"} <span className="text-sm font-semibold text-mid">DEL-{i.id.slice(0, 8)}</span></p>
              <p className={`text-sm ${i.status === "held" ? "font-black text-black" : "font-bold text-blue-dark"}`}>{STATUS[i.status]}</p>
            </div>
            <p className="mt-1 text-sm text-mid">
              Requested {day(i.requested_at)}
              {i.erase_after && ` · erases ${day(i.erase_after)}`}
              {i.hold_reasons.length > 0 && ` · ${i.hold_reasons.map((r) => REASON[r] ?? r).join(", ")}`}
            </p>
            {i.account?.deletion_hold_note && <p className="mt-2 text-sm text-black">Hold note: {i.account.deletion_hold_note}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {i.status === "held" && (
                <Button disabled={busy !== null} onClick={() => post(`/api/admin/deletions/${i.id}`, { action: "release" }, "Released. It will run at the next nightly job.", i.id)}>
                  Release hold
                </Button>
              )}
              <Button variant="secondary" disabled={busy !== null} onClick={() => post(`/api/admin/deletions/${i.id}`, { action: "reverse" }, "Reversed. The account is active again and the member has been emailed.", i.id)}>
                Reverse — keep the account
              </Button>
              {i.account && i.status === "scheduled" && (
                <Button variant="danger" disabled={busy !== null} onClick={() => post("/api/admin/deletions/hold", { account_id: i.account!.id, hold: true, note: null }, "Held.", i.id)}>
                  Put on hold
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>

      <StaffHoldSearch onDone={(m) => { setNotice({ tone: "success", message: m }); router.refresh(); }} />

      <section className="space-y-2">
        <h2 className="text-xl font-extrabold text-black">Closed</h2>
        {closed.length === 0 && <p className="text-sm text-mid">None yet.</p>}
        <ul className="divide-y divide-line rounded-2xl bg-card px-5 shadow-sm">
          {closed.map((i) => (
            <li key={i.id} id={i.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between">
              <span className="font-semibold text-black">DEL-{i.id.slice(0, 8)} · {i.account?.name ?? "—"}</span>
              <span className="text-mid">{STATUS[i.status]} · {day(i.ended_at ?? i.requested_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type SearchMember = { id: string; name: string; email: string | null };

/** A staff hold can be set on any account, before any request exists. */
function StaffHoldSearch({ onDone }: { onDone: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchMember[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    const res = await fetch(`/api/admin/credits?q=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Search failed."); return; }
    setResults(json.members ?? []);
  }
  async function hold(member: SearchMember, value: boolean) {
    const res = await fetch("/api/admin/deletions/hold", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: member.id, hold: value, note: value ? note || null : null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not save."); return; }
    onDone(value ? `Deletion hold set on ${member.name}.` : `Deletion hold cleared on ${member.name}.`);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 shadow-sm">
      <h2 className="text-xl font-extrabold text-black">Staff hold</h2>
      <p className="text-sm text-mid">For a safeguarding concern or incident the system cannot see. A held account is never erased until the hold is released.</p>
      {error && <FormNotice tone="error">{error}</FormNotice>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor="hold-search">Find a member</Label>
          <Input id="hold-search" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        </div>
        <Button variant="secondary" className="sm:self-end" onClick={search} disabled={q.trim().length < 2}>Search</Button>
      </div>
      <div>
        <Label htmlFor="hold-note">Note (staff only, cleared when the account is erased)</Label>
        <Textarea id="hold-note" className="mt-1" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ul className="divide-y divide-line">
        {results.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm"><span className="font-bold text-black">{m.name}</span> {m.email && <span className="text-mid">· {m.email}</span>}</span>
            <span className="flex gap-2">
              <Button variant="danger" onClick={() => hold(m, true)}>Set hold</Button>
              <Button variant="secondary" onClick={() => hold(m, false)}>Clear hold</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
