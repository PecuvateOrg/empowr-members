"use client";

// Staff entry for a private booking already agreed outside the app. The
// database applies the same slot rules as online (except the two-week lead
// time) and computes the list price; staff may record an agreed price, and
// must for a custom event.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  HIRE_SIZES,
  KIND_LABELS,
  MANUAL_KINDS,
  PAYMENT_HANDLING,
  PAYMENT_HANDLING_LABELS,
  londonSlotIso,
  type HireSize,
  type PaymentHandling,
} from "@/lib/private-bookings";

type Kind = (typeof MANUAL_KINDS)[number];
type Member = { account_id: string; account_name: string; participants: { id: string; name: string }[] };
type Place = { participant_id: string; equipment: "own" | "hire"; hire_size: HireSize | "" };

const input = "rounded-xl border border-line bg-white px-3 py-2 text-black";

export function PrivateManualBookingForm() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [host, setHost] = useState<Member | null>(null);
  const [kind, setKind] = useState<Kind>("birthday");
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState<15 | 16>(15);
  const [hours, setHours] = useState<1 | 2>(2);
  const [paidPlaces, setPaidPlaces] = useState(10);
  const [places, setPlaces] = useState<Place[]>([]);
  const [handling, setHandling] = useState<PaymentHandling>("paid_bank_transfer");
  const [pricePounds, setPricePounds] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  const isCoaching = kind === "coaching_one" || kind === "coaching_group";

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/private-bookings/members?q=${encodeURIComponent(search.trim())}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        setResults(res.ok ? body.results ?? [] : []);
      } catch {
        /* aborted or offline: keep the previous results */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  function chooseKind(next: Kind) {
    setKind(next);
    if (next === "birthday") {
      setHours(2);
      setStartHour(15);
      setPaidPlaces(10);
    } else if (next === "coaching_one") {
      setPaidPlaces(1);
    } else if (next === "coaching_group") {
      setPaidPlaces(3);
    }
    setPlaces(
      next === "coaching_one" || next === "coaching_group"
        ? Array.from({ length: next === "coaching_one" ? 1 : 3 }, () => ({ participant_id: "", equipment: "own", hire_size: "" }))
        : []
    );
  }

  function changeCount(n: number) {
    const count = Math.max(1, Math.min(200, Number.isFinite(n) ? n : 1));
    setPaidPlaces(count);
    if (isCoaching) {
      setPlaces((current) =>
        Array.from({ length: count }, (_, i) => current[i] ?? { participant_id: "", equipment: "own", hire_size: "" })
      );
    }
  }

  async function submit() {
    if (!host || !date) return;
    setBusy(true);
    setOutcome(null);
    const pricePence = pricePounds.trim() === "" ? undefined : Math.round(Number(pricePounds) * 100);
    try {
      const res = await fetch("/api/admin/private-bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          host_account_id: host.account_id,
          starts_at: londonSlotIso(date, startHour),
          hours,
          paid_places: paidPlaces,
          places: isCoaching
            ? places.map((p) => ({
                participant_id: p.participant_id,
                equipment: p.equipment,
                ...(p.equipment === "hire" ? { hire_size: p.hire_size } : {}),
              }))
            : [],
          payment_handling: handling,
          ...(pricePence !== undefined && Number.isFinite(pricePence) ? { price_pence: pricePence } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setOutcome({
          ok: true,
          text: body.emailed
            ? "Saved. The member has been emailed their confirmation."
            : "Saved — but the confirmation email did NOT send. Tell the member directly.",
        });
        router.refresh();
      } else {
        setOutcome({ ok: false, text: body.error ?? "Could not save the booking." });
      }
    } catch {
      setOutcome({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  const placesComplete =
    !isCoaching || places.every((p) => p.participant_id && (p.equipment === "own" || p.hire_size));
  const canSubmit =
    !busy && !!host && !!date && placesComplete && (kind !== "custom" || pricePounds.trim() !== "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4 text-sm"
    >
      <div>
        <label htmlFor="pb-host" className="block font-bold text-mid">Host member</label>
        {host ? (
          <p className="mt-1 flex items-center gap-3">
            <span className="font-bold text-black">{host.account_name}</span>
            <button type="button" onClick={() => setHost(null)} className="text-blue underline">Change</button>
          </p>
        ) : (
          <>
            <input
              id="pb-host"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by account holder or skater name"
              autoComplete="off"
              className={`mt-1 w-full ${input}`}
            />
            {results.length > 0 && (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">
                {results.map((m) => (
                  <li key={m.account_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setHost(m);
                        setSearch("");
                        setResults([]);
                      }}
                      className="w-full px-3 py-2 text-left"
                    >
                      <span className="font-bold text-black">{m.account_name}</span>
                      {m.participants.length > 0 && (
                        <span className="text-mid"> — {m.participants.map((p) => p.name).join(", ")}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-bold text-mid">
          Type
          <select value={kind} onChange={(e) => chooseKind(e.target.value as Kind)} className={input}>
            {MANUAL_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          Saturday
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          Start
          <select
            value={startHour}
            disabled={kind === "birthday"}
            onChange={(e) => setStartHour(Number(e.target.value) as 15 | 16)}
            className={input}
          >
            <option value={15}>3pm</option>
            <option value={16}>4pm</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          Length
          <select
            value={hours}
            disabled={kind === "birthday"}
            onChange={(e) => setHours(Number(e.target.value) as 1 | 2)}
            className={input}
          >
            <option value={1}>1 hour</option>
            <option value={2}>2 hours</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          {kind === "birthday" ? "Paid skaters (birthday person is extra, free)" : "Places"}
          <input
            type="number"
            min={1}
            value={paidPlaces}
            disabled={kind === "coaching_one"}
            onChange={(e) => changeCount(Number(e.target.value))}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          How it was paid
          <select value={handling} onChange={(e) => setHandling(e.target.value as PaymentHandling)} className={input}>
            {PAYMENT_HANDLING.map((h) => (
              <option key={h} value={h}>{PAYMENT_HANDLING_LABELS[h]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold text-mid">
          {kind === "custom" ? "Agreed price (£)" : "Agreed price (£) — leave blank for the standard price"}
          <input
            type="number"
            min={0}
            step="0.01"
            value={pricePounds}
            onChange={(e) => setPricePounds(e.target.value)}
            className={input}
          />
        </label>
      </div>

      {isCoaching && (
        <div className="space-y-3">
          <p className="font-bold text-mid">Skaters (from the host’s account; each needs a signed waiver)</p>
          {!host ? (
            <p className="text-mid">Choose the host first.</p>
          ) : (
            places.map((place, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-line bg-white p-3 sm:grid-cols-3">
                <select
                  aria-label={`Skater ${i + 1}`}
                  value={place.participant_id}
                  onChange={(e) =>
                    setPlaces((cur) => cur.map((p, j) => (j === i ? { ...p, participant_id: e.target.value } : p)))
                  }
                  className={input}
                >
                  <option value="">Skater {i + 1}</option>
                  {host.participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  aria-label={`Skater ${i + 1} equipment`}
                  value={place.equipment}
                  onChange={(e) =>
                    setPlaces((cur) =>
                      cur.map((p, j) => (j === i ? { ...p, equipment: e.target.value as Place["equipment"] } : p))
                    )
                  }
                  className={input}
                >
                  <option value="own">Own equipment</option>
                  <option value="hire">Skate hire</option>
                </select>
                {place.equipment === "hire" && (
                  <select
                    aria-label={`Skater ${i + 1} hire size`}
                    value={place.hire_size}
                    onChange={(e) =>
                      setPlaces((cur) => cur.map((p, j) => (j === i ? { ...p, hire_size: e.target.value as HireSize } : p)))
                    }
                    className={input}
                  >
                    <option value="">Size</option>
                    {HIRE_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 font-bold text-mid">
        Internal note (optional — never shown to the member)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save booking"}
      </button>

      {outcome && (
        <p
          role={outcome.ok ? "status" : "alert"}
          className="flex items-start gap-2 rounded-xl border border-line bg-white p-3 text-black"
        >
          {!outcome.ok && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden />}
          {outcome.text}
        </p>
      )}
    </form>
  );
}
