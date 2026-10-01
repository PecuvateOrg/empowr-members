"use client";

// "Add a paid skater" on the private booking check-in screen. Staff set up
// the addition; the customer pays on their own phone by scanning the QR code
// (the walk-in pattern). The places appear once Stripe confirms — refresh the
// page. Birthday: a count, and each new guest still joins through the invite
// link with a waiver. Group coaching: find a member's skater; a skater with
// no signed waiver cannot be added.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, UserPlus } from "lucide-react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import {
  EQUIPMENT,
  EQUIPMENT_OPTION_LABELS,
  HIRE_SIZES,
  type Equipment,
  type HireSize,
} from "@/lib/private-bookings";

type Candidate = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  waiverSigned: boolean;
  alreadyOn: boolean;
};
type Choice = { equipment: Equipment; hire_size: HireSize | "" };
type Handoff = { checkoutUrl: string; qrDataUrl: string | null; amountPence: number };

export function PrivateDoorAddPanel({
  bookingId,
  isBirthday,
  maxMore,
}: {
  bookingId: string;
  isBirthday: boolean;
  maxMore: number;
}) {
  const router = useRouter();
  const [count, setCount] = useState("1");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [chosen, setChosen] = useState<Record<string, Choice & { accountId: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [copied, setCopied] = useState(false);

  const ids = Object.keys(chosen);
  const added = isBirthday ? Number(count) : ids.length;
  const oneFamily = new Set(ids.map((id) => chosen[id].accountId)).size <= 1;
  const ready =
    !busy &&
    Number.isInteger(added) &&
    added >= 1 &&
    added <= maxMore &&
    oneFamily &&
    ids.every((id) => chosen[id].equipment !== "hire" || chosen[id].hire_size);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/private-bookings/${bookingId}/door?q=${encodeURIComponent(query.trim())}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Could not search.");
      else {
        setResults(body.results ?? []);
        setSearched(true);
      }
    } catch {
      setError("Could not search.");
    }
    setBusy(false);
  }

  function toggle(c: Candidate) {
    setChosen((cur) => {
      const next = { ...cur };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = { equipment: "own", hire_size: "", accountId: c.accountId };
      return next;
    });
  }

  async function takePayment() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/private-bookings/${bookingId}/door`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          added_places: added,
          places: isBirthday
            ? []
            : ids.map((id) => ({
                participant_id: id,
                equipment: chosen[id].equipment,
                ...(chosen[id].equipment === "hire" ? { hire_size: chosen[id].hire_size } : {}),
              })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.checkout_url) {
        setHandoff({ checkoutUrl: body.checkout_url, qrDataUrl: body.qr_data_url ?? null, amountPence: body.amount_pence });
      } else {
        setError(body.error ?? "Could not start the payment.");
      }
    } catch {
      setError("Could not start the payment.");
    }
    setBusy(false);
  }

  function reset() {
    setHandoff(null);
    setChosen({});
    setResults([]);
    setSearched(false);
    setQuery("");
    setCount("1");
    setCopied(false);
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line p-5">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
        <UserPlus className="h-5 w-5 text-blue" aria-hidden /> Add a paid skater
      </h2>
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {handoff ? (
        <div className="space-y-3">
          <FormNotice tone="success">
            Places held. They have about 30 minutes to pay {formatPrice(handoff.amountPence)}. Refresh this page once
            they have paid to see the new places.
          </FormNotice>
          {handoff.qrDataUrl && (
            <div className="flex justify-center">
              <Image src={handoff.qrDataUrl} alt="Scan to pay" width={220} height={220} unoptimized className="rounded-xl border border-line" />
            </div>
          )}
          <p className="text-center text-sm font-semibold text-mid">
            Let them scan this with their phone camera, or send them the link.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              className="px-4 py-1.5 text-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(handoff.checkoutUrl);
                  setCopied(true);
                } catch {
                  setError("Could not copy — read the link from the QR instead.");
                }
              }}
            >
              {copied ? "Link copied" : "Copy payment link"}
            </Button>
            <Button className="px-4 py-1.5 text-sm" onClick={reset}>
              Done — refresh
            </Button>
          </div>
        </div>
      ) : maxMore < 1 ? (
        <p className="text-sm text-mid">This booking is at its maximum number of skaters.</p>
      ) : isBirthday ? (
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="door-count">How many extra skaters?</Label>
            <Input
              id="door-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxMore}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="mt-1 w-32"
            />
          </div>
          <p className="text-mid">
            Each one still registers on the invite link and signs a waiver before skating.
          </p>
          <Button onClick={takePayment} disabled={!ready}>
            {busy ? "Starting…" : "Take payment"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="door-search">Find the skater by name</Label>
              <Input
                id="door-search"
                className="mt-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim().length >= 2) search();
                }}
              />
            </div>
            <Button variant="secondary" onClick={search} disabled={busy || query.trim().length < 2}>
              <Search className="mr-1 inline h-4 w-4" aria-hidden /> Search
            </Button>
          </div>
          {searched && results.length === 0 && (
            <p className="text-mid">No members found. They need an account and a signed waiver first.</p>
          )}
          <ul className="space-y-2">
            {results.map((c) => {
              const blocked = !c.waiverSigned || c.alreadyOn;
              return (
                <li key={c.id} className="rounded-xl bg-white p-3">
                  <label className="flex items-center gap-2 font-bold text-black">
                    <input type="checkbox" checked={!!chosen[c.id]} disabled={blocked} onChange={() => toggle(c)} />
                    {c.name}
                    <span className="font-normal text-mid">({c.accountName})</span>
                    {c.alreadyOn && <span className="font-normal text-mid"> — already on this booking</span>}
                    {!c.alreadyOn && !c.waiverSigned && <span className="font-bold text-red-dark"> — no waiver</span>}
                  </label>
                  {chosen[c.id] && (
                    <div className="mt-2 space-y-2">
                      <select
                        aria-label={`${c.name} equipment`}
                        value={chosen[c.id].equipment}
                        onChange={(e) =>
                          setChosen((cur) => ({
                            ...cur,
                            [c.id]: { ...cur[c.id], equipment: e.target.value as Equipment, hire_size: "" },
                          }))
                        }
                        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                      >
                        {EQUIPMENT.map((e) => (
                          <option key={e} value={e}>{EQUIPMENT_OPTION_LABELS[e]}</option>
                        ))}
                      </select>
                      {chosen[c.id].equipment === "hire" && (
                        <select
                          aria-label={`${c.name} hire size`}
                          value={chosen[c.id].hire_size}
                          onChange={(e) =>
                            setChosen((cur) => ({ ...cur, [c.id]: { ...cur[c.id], hire_size: e.target.value as HireSize } }))
                          }
                          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-black"
                        >
                          <option value="">Choose a size</option>
                          {HIRE_SIZES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {!oneFamily && (
            <p className="font-bold text-red-dark">Add one family at a time — each family pays separately.</p>
          )}
          <Button onClick={takePayment} disabled={!ready}>
            {busy ? "Starting…" : "Take payment"}
          </Button>
        </div>
      )}
    </section>
  );
}
