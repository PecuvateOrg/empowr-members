"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, UserPlus } from "lucide-react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { ageOn } from "@/lib/age";

type Candidate = {
  id: string;
  name: string;
  dob: string;
  accountId: string;
  accountName: string;
  ageEligible: boolean;
  alreadyBooked: boolean;
};

type PaymentHandoff = {
  checkoutUrl: string;
  qrDataUrl: string | null;
  totalPence: number;
};

/**
 * Door walk-in: find a member who turned up without booking, hold their
 * place at the door price, and hand them a link to pay on their own phone.
 *
 * Search is manual (a button, not keystroke-debounced) — it hits an
 * admin-gated endpoint that returns real names and ages, and staff at a busy
 * door type in bursts. Debouncing would fire several such queries per name.
 *
 * The panel deliberately shows only what it can prove client-side: age
 * eligibility and whether a live booking already exists. Waiver cover is
 * checked server-side when Take payment is pressed, so there is exactly one
 * waiver gate rather than an advisory copy free to drift from the real one.
 */
export function WalkInPanel({
  occurrenceId,
  offeringTitle,
  walkInPricePence,
  sessionOver,
}: {
  occurrenceId: string;
  offeringTitle: string;
  walkInPricePence: number | null;
  sessionOver: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<PaymentHandoff | null>(null);
  const [copied, setCopied] = useState(false);

  if (sessionOver) return null;

  if (walkInPricePence === null) {
    return (
      <section className="rounded-2xl border border-line p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
          <UserPlus className="h-5 w-5 text-blue" aria-hidden /> Walk-ins
        </h2>
        <p className="mt-2 text-sm font-semibold text-mid">
          No door price is set for {offeringTitle}, so walk-ins can&apos;t be
          taken here. Set one on the offering and it will appear.
        </p>
      </section>
    );
  }

  async function search() {
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(
        `/api/admin/participants/search?q=${encodeURIComponent(
          query.trim()
        )}&occurrence_id=${occurrenceId}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not search.");
        return;
      }
      setResults(body.results ?? []);
      setSearched(true);
    } catch {
      setError("Could not search.");
    } finally {
      setSearching(false);
    }
  }

  async function takePayment(candidate: Candidate) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrence_id: occurrenceId,
          participant_ids: [candidate.id],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Could not take the walk-in.");
        return;
      }
      setHandoff({
        checkoutUrl: body.checkout_url,
        qrDataUrl: body.qr_data_url ?? null,
        totalPence: body.total_pence ?? walkInPricePence,
      });
      // The hold exists now and shows on the register as payment pending —
      // refresh so staff can see it (and release it) without leaving.
      router.refresh();
    } catch {
      setError("Could not take the walk-in.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setHandoff(null);
    setSelected(null);
    setResults([]);
    setSearched(false);
    setQuery("");
    setCopied(false);
    setError(null);
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Add walk-in ({formatPrice(walkInPricePence)} at the door)
      </Button>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-black">
          <UserPlus className="h-5 w-5 text-blue" aria-hidden /> Add walk-in
        </h2>
        <span className="rounded-full bg-blue-pale px-3 py-1 text-sm font-bold text-blue-dark">
          {formatPrice(walkInPricePence)} at the door
        </span>
      </div>

      {error && <FormNotice tone="error">{error}</FormNotice>}

      {handoff ? (
        <div className="space-y-3">
          <FormNotice tone="success">
            Place held for {selected?.name}. They have about 30 minutes to pay{" "}
            {formatPrice(handoff.totalPence)} — the register updates itself
            once it lands.
          </FormNotice>
          {handoff.qrDataUrl && (
            <div className="flex justify-center">
              <Image
                src={handoff.qrDataUrl}
                alt="Scan to pay"
                width={220}
                height={220}
                unoptimized
                className="rounded-xl border border-line"
              />
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
              Add another
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="walk-in-search">Search by name</Label>
              <Input
                id="walk-in-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim().length >= 2) {
                    e.preventDefault();
                    void search();
                  }
                }}
                placeholder="e.g. Jordan"
                autoComplete="off"
              />
            </div>
            <Button
              onClick={search}
              disabled={searching || query.trim().length < 2}
              className="px-5 py-2.5"
            >
              <span className="flex items-center gap-1.5">
                <Search className="h-4 w-4" aria-hidden />
                {searching ? "Searching…" : "Search"}
              </span>
            </Button>
          </div>

          {searched && results.length === 0 && (
            <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
              Nobody found. Everyone attending needs a member account — ask them
              to sign up on their phone, then search again.
            </p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {results.map((candidate) => {
                const blocked = !candidate.ageEligible || candidate.alreadyBooked;
                const isMinor = ageOn(candidate.dob) < 18;
                return (
                  <li
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-extrabold text-black">
                        {candidate.name}
                      </p>
                      <p className="text-sm font-semibold text-mid">
                        {ageOn(candidate.dob)} · {candidate.accountName}
                      </p>
                      {candidate.alreadyBooked && (
                        <p className="text-sm font-bold text-blue-dark">
                          Already on the register
                        </p>
                      )}
                      {!candidate.ageEligible && (
                        <p className="text-sm font-bold text-red-dark">
                          Outside the age range for this session
                        </p>
                      )}
                      {!blocked && isMinor && (
                        <p className="text-sm font-semibold text-red-dark">
                          Under 18 — collect departure consent as usual, it
                          isn&apos;t captured here.
                        </p>
                      )}
                    </div>
                    <Button
                      className="px-4 py-1.5 text-sm"
                      disabled={blocked || submitting}
                      onClick={() => {
                        setSelected(candidate);
                        void takePayment(candidate);
                      }}
                    >
                      {submitting && selected?.id === candidate.id
                        ? "Holding…"
                        : "Take payment"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            className="text-sm font-bold text-mid underline transition-colors hover:text-blue"
          >
            Close
          </button>
        </>
      )}
    </section>
  );
}
