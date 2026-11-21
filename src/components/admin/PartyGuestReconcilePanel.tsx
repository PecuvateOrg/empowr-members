"use client";

// Staff fix for a party guest whose family added them and signed the waiver
// but never finished registering (#194). Staff find the child by name, email
// or phone and add them explicitly; the server checks the family's own waiver
// and the party's rules (POST /api/admin/private-bookings/[id]/guests).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserCheck } from "lucide-react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { EQUIPMENT, EQUIPMENT_OPTION_LABELS, HIRE_SIZES, type Equipment, type HireSize } from "@/lib/private-bookings";

type Result = { account_id: string; account_name: string; participants: { id: string; name: string }[] };
type Chosen = { id: string; name: string; family: string };

export function PartyGuestReconcilePanel({ bookingId, registeredIds }: { bookingId: string; registeredIds: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [equipment, setEquipment] = useState<Equipment>("hire");
  const [hireSize, setHireSize] = useState<HireSize | "">("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/admin/private-bookings/members?q=${encodeURIComponent(query.trim())}`);
    const body = await res.json().catch(() => ({}));
    setResults(res.ok ? (body.results ?? []) : []);
    if (!res.ok) setNotice({ ok: false, text: body.error ?? "Search failed — try again." });
    setBusy(false);
  }

  async function add() {
    if (!chosen || (equipment === "hire" && !hireSize)) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/admin/private-bookings/${bookingId}/guests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participant_id: chosen.id,
        equipment,
        ...(equipment === "hire" ? { hire_size: hireSize } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice({ ok: true, text: `${chosen.name} is now on the party register.` });
      setChosen(null);
      setResults(null);
      setQuery("");
      router.refresh();
    } else {
      setNotice({ ok: false, text: body.error ?? "Could not add the skater — please try again." });
    }
    setBusy(false);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line p-5">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
        <UserCheck className="h-5 w-5 text-blue" aria-hidden /> Add a guest who didn’t finish registering
      </h2>
      <p className="text-sm text-mid">
        For a child whose own parent or guardian added them and signed the waiver, but who is missing from
        this register. Check with the family first. The child stays on their family’s account, and their
        family’s own waiver is checked.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Label htmlFor="party-guest-q" className="sr-only">Find a child</Label>
        <Input
          id="party-guest-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Child or parent name, email or phone"
        />
        <Button type="submit" disabled={busy || query.trim().length < 2}>
          <Search className="h-4 w-4" aria-hidden /> Find
        </Button>
      </form>

      {results && results.length === 0 && <p className="text-sm text-mid">No matching families.</p>}
      {results && results.length > 0 && !chosen && (
        <ul className="space-y-2 text-sm">
          {results.map((r) => (
            <li key={r.account_id} className="rounded-xl border border-line p-3">
              <p className="font-bold text-black">{r.account_name || "Unnamed account"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.participants.map((p) =>
                  registeredIds.includes(p.id) ? (
                    <span key={p.id} className="text-mid">{p.name} (already registered)</span>
                  ) : (
                    <Button
                      key={p.id}
                      type="button"
                      onClick={() => setChosen({ id: p.id, name: p.name, family: r.account_name })}
                    >
                      Add {p.name}
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="space-y-3 rounded-xl border border-line p-3 text-sm">
          <p className="text-black">
            Adding <span className="font-bold">{chosen.name}</span> from {chosen.family || "this family"}’s account.
          </p>
          <div>
            <Label htmlFor="party-guest-equipment">Equipment</Label>
            <select
              id="party-guest-equipment"
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as Equipment)}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
            >
              {EQUIPMENT.map((e) => (
                <option key={e} value={e}>{EQUIPMENT_OPTION_LABELS[e]}</option>
              ))}
            </select>
          </div>
          {equipment === "hire" && (
            <div>
              <Label htmlFor="party-guest-size">Hire size</Label>
              <select
                id="party-guest-size"
                value={hireSize}
                onChange={(e) => setHireSize(e.target.value as HireSize)}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
              >
                <option value="">Choose a size</option>
                {HIRE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void add()} disabled={busy || (equipment === "hire" && !hireSize)}>
              {busy ? "Adding…" : "Add to register"}
            </Button>
            <button type="button" className="text-sm font-semibold text-mid underline" onClick={() => setChosen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && <FormNotice tone={notice.ok ? "success" : "error"}>{notice.text}</FormNotice>}
    </section>
  );
}
