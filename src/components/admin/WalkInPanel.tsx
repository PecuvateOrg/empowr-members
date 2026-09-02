"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, UserPlus } from "lucide-react";
import { Button, FormNotice, Input, Label } from "@/components/ui/form";
import { DepartureConsentFields } from "@/components/booking/DepartureConsentFields";
import {
  consentComplete,
  defaultConsentState,
  toDepartureConsentEntry,
  type DepartureConsentState,
} from "@/lib/departure-consent-form";
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
  waiverSigned: boolean;
  coveredByPlan: string | null;
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
 * Two things are shown per result that the panel cannot itself enforce: age
 * eligibility and waiver cover. Both are re-checked server-side when Take
 * payment is pressed, and the server is authoritative — these are here so
 * staff find out at the point of searching rather than after pressing the
 * button, which is what used to happen with waivers.
 *
 * For anyone under 18 the departure consent question is asked HERE, using the
 * same fields and the same completeness rule as the online booking form (see
 * lib/departure-consent-form). It stays optional, exactly as it is online:
 * the default is that a child is collected in person, and staff take payment
 * without touching it. What the panel must never do is pre-fill it from the
 * participant's stored travel method and call that a parent's answer.
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
  // Which minor's departure-consent block is open, and the state of each.
  // Keyed by participant so re-searching does not silently carry an answer
  // from one person onto another.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [consent, setConsent] = useState<Record<string, DepartureConsentState>>({});

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
    setExpandedId(null);
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
      const found: Candidate[] = body.results ?? [];
      setResults(found);
      // Seed a consent state per minor. Pre-filling the travel method from a
      // stored default is fine — it is the parent's own standing answer — but
      // the confirm_* checklist always starts unchecked and the block starts
      // collapsed, so nothing is ever submitted that nobody looked at.
      setConsent(
        Object.fromEntries(
          found
            .filter((c) => ageOn(c.dob) < 18)
            .map((c) => [c.id, defaultConsentState(null)])
        )
      );
      setSearched(true);
    } catch {
      setError("Could not search.");
    } finally {
      setSearching(false);
    }
  }

  function patchConsent(id: string, patch: Partial<DepartureConsentState>) {
    setConsent((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function takePayment(candidate: Candidate) {
    setSubmitting(true);
    setError(null);
    setSelected(candidate);
    try {
      const state = consent[candidate.id];
      const entry = state ? toDepartureConsentEntry(candidate.id, state) : null;

      const res = await fetch("/api/admin/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrence_id: occurrenceId,
          participant_ids: [candidate.id],
          departure_consents: entry ? [entry] : [],
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
    setExpandedId(null);
    setConsent({});
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
                // Waiver status is deliberately NOT part of `blocked`. It is
                // advisory — resolved at search time, and it fails to
                // "unsigned" if the account's email lookup errors. Hard
                // disabling on it would mean a transient failure leaves staff
                // unable to take money from a member who is properly covered,
                // at a door, with no override. The warning below is the
                // point: staff find out before pressing rather than after.
                // The route re-checks properly and refuses with a clear
                // message if it really is missing.
                const blocked = !candidate.ageEligible || candidate.alreadyBooked;
                const isMinor = ageOn(candidate.dob) < 18;
                const state = consent[candidate.id];
                const isExpanded = expandedId === candidate.id;
                const ready = !state || consentComplete(state);
                const busy = submitting && selected?.id === candidate.id;

                return (
                  <li key={candidate.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                        {/* Warns, does not block — same reasoning as the
                            waiver status below it. Taking payment here is a
                            double charge (they already pay monthly), but a
                            transient read failure must not strand staff at a
                            door, so this has to be loud rather than final. */}
                        {!candidate.alreadyBooked && candidate.coveredByPlan && (
                          <p className="text-sm font-bold text-red-dark">
                            Already covered by {candidate.coveredByPlan} — do
                            not take payment. Their place is included in their
                            subscription.
                          </p>
                        )}
                        {!candidate.ageEligible && (
                          <p className="text-sm font-bold text-red-dark">
                            Outside the age range for this session
                          </p>
                        )}
                        {candidate.ageEligible &&
                          !candidate.alreadyBooked &&
                          !candidate.waiverSigned && (
                            <p className="text-sm font-bold text-red-dark">
                              No waiver on file — they need to sign before they
                              can skate. If they have just signed, search again
                              to pick it up.
                            </p>
                          )}
                      </div>

                      {isMinor && !blocked && !isExpanded ? (
                        <Button
                          variant="secondary"
                          className="px-4 py-1.5 text-sm"
                          disabled={submitting}
                          onClick={() => setExpandedId(candidate.id)}
                        >
                          Continue
                        </Button>
                      ) : (
                        !isExpanded && (
                          <Button
                            className="px-4 py-1.5 text-sm"
                            disabled={blocked || submitting}
                            onClick={() => void takePayment(candidate)}
                          >
                            {busy ? "Holding…" : "Take payment"}
                          </Button>
                        )
                      )}
                    </div>

                    {isMinor && isExpanded && state && (
                      <div className="mt-3 rounded-xl border border-line p-4">
                        <label className="flex items-start gap-2.5 text-sm font-semibold text-mid">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-blue"
                            checked={state.enabled}
                            disabled={submitting}
                            onChange={(e) =>
                              patchConsent(candidate.id, {
                                enabled: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <span className="block font-bold text-black">
                              Leaving unaccompanied after this session
                            </span>
                            Leave this off if they&apos;re being collected in
                            person, which is the norm. Only turn it on if the
                            parent or carer has said they can leave by
                            themselves tonight.
                          </span>
                        </label>

                        {state.enabled && (
                          <DepartureConsentFields
                            state={state}
                            disabled={submitting}
                            onChange={(patch) => patchConsent(candidate.id, patch)}
                          />
                        )}

                        {!ready && (
                          <p className="mt-3 text-sm font-bold text-red-dark">
                            Finish the checklist, or switch it off if
                            they&apos;re being collected.
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                          <Button
                            className="px-4 py-1.5 text-sm"
                            disabled={blocked || submitting || !ready}
                            onClick={() => void takePayment(candidate)}
                          >
                            {busy
                              ? "Holding…"
                              : `Take payment (${formatPrice(walkInPricePence)})`}
                          </Button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setExpandedId(null)}
                            className="text-sm font-bold text-mid underline transition-colors hover:text-blue"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}
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
