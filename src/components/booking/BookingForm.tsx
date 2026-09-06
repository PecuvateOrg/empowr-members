"use client";

// Participant selection + hold submission. Age eligibility is computed
// server-side (page) and re-enforced by the API; the waiver gate lives
// in the API — a stale "signed" state here just means a 409 with a
// waiver link. A 201 means the hold succeeded and carries the Stripe
// Checkout URL — the redirect is the final step; the webhook confirms.
//
// Departure consent (2026-08-10 decision) is asked fresh at every booking
// for minors, not signed once like the waiver — pre-filled from the
// participant's profile default, but the confirm_* checklist always
// starts unchecked. Submitting nothing for a minor just means they're
// collected in person as normal; it's optional, not a gate.
import { useState } from "react";
import Link from "next/link";
import { Button, FormNotice } from "@/components/ui/form";
import { DepartureConsentFields } from "@/components/booking/DepartureConsentFields";
import {
  consentComplete,
  defaultConsentState,
  toDepartureConsentEntry,
  type DepartureConsentState,
} from "@/lib/departure-consent-form";
import { formatPrice } from "@/lib/format";

export type BookingFormParticipant = {
  id: string;
  name: string;
  age: number;
  eligible: boolean;
  waiverSigned: boolean;
  isMinor: boolean;
  defaultTravelMethod: string | null;
  /** Name of the plan whose active Subscription already covers this session,
   *  or null. Covered participants cannot be selected — their place is
   *  already held and paying again would be a straight double charge. The
   *  API enforces the same rule; this only stops it being offered. */
  coveredByPlan: string | null;
};

type UnsignedParticipant = { id: string; name: string };

/** The early bird tier for this date, when one is on offer and unsold.
 *  null covers every other case — no allocation set, or all of them gone —
 *  and the form then behaves exactly as it did before this existed. */
export type EarlyBirdOffer = {
  pricePence: number;
  /** Tickets left in the allocation. Advisory only: the authority is the
   *  count mem_hold_bookings() takes under its row lock, so this can be
   *  stale by the time someone submits — which is why `early_bird_gone`
   *  is handled below rather than treated as impossible. */
  remaining: number;
};

export function BookingForm({
  target,
  participants,
  pricePence,
  earlyBird,
  ageLabel,
}: {
  target: { occurrence_id?: string; course_run_id?: string };
  participants: BookingFormParticipant[];
  pricePence: number;
  earlyBird?: EarlyBirdOffer | null;
  ageLabel: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Pre-selected when it is on offer: an early bird ticket is cheaper and
  // first-come, so defaulting to the standard price would charge people more
  // for not noticing a radio button.
  const [tier, setTier] = useState<"early_bird" | "standard">(
    earlyBird ? "early_bird" : "standard"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsigned, setUnsigned] = useState<UnsignedParticipant[]>([]);
  const [redirecting, setRedirecting] = useState(false);
  const [departure, setDeparture] = useState<Record<string, DepartureConsentState>>(() =>
    Object.fromEntries(
      participants
        .filter((p) => p.isMinor)
        .map((p) => [p.id, defaultConsentState(p.defaultTravelMethod)])
    )
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patchDeparture(id: string, patch: Partial<DepartureConsentState>) {
    setDeparture((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const selectedMinorsIncomplete = [...selected].some((id) => {
    const state = departure[id];
    return state && !consentComplete(state);
  });

  // The allocation is per BOOKING, not per person: three people on one
  // booking need three of the ten tickets, and mem_hold_bookings() refuses
  // the whole hold if they do not all fit. So the option is only usable
  // while enough tickets remain for everyone currently selected — otherwise
  // the form would offer a price the server is certain to reject.
  const earlyBirdUsable =
    earlyBird != null &&
    selected.size > 0 &&
    selected.size <= earlyBird.remaining;
  const usingEarlyBird = tier === "early_bird" && earlyBirdUsable;
  const unitPence =
    usingEarlyBird && earlyBird ? earlyBird.pricePence : pricePence;

  async function submit() {
    setSubmitting(true);
    setError(null);
    setUnsigned([]);
    try {
      const departure_consents = [...selected]
        .map((id) => {
          const state = departure[id];
          return state ? toDepartureConsentEntry(id, state) : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          participant_ids: [...selected],
          departure_consents,
          // Only the CHOICE travels. The price is resolved server-side from
          // the offering, so this cannot be used to name a cheaper one.
          early_bird: usingEarlyBird,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 201 && typeof body.checkout_url === "string") {
        // Keep the button disabled while the browser navigates away.
        setRedirecting(true);
        window.location.assign(body.checkout_url);
        return;
      }
      if (body.error === "waiver_required") {
        setUnsigned(body.unsigned ?? []);
        return;
      }
      if (body.error === "already_covered") {
        const names = (body.covered ?? [])
          .map((c: { name: string }) => c.name)
          .filter(Boolean)
          .join(", ");
        setError(
          `${names || "Someone on this booking"} is already covered by a ` +
            `subscription for this session — their place is held, so there is ` +
            `nothing to pay. Deselect them to book anyone else.`
        );
        return;
      }
      if (body.error === "capacity") {
        setError("Not enough spaces left on this session.");
        return;
      }
      // Someone took the last early bird tickets between this page rendering
      // and this request. Drop to the standard price and say so, rather than
      // dead-ending them: the session itself almost certainly still has
      // places, and they only need to press the button again.
      if (body.error === "early_bird_gone") {
        setTier("standard");
        setError(
          typeof body.message === "string"
            ? body.message
            : "The early bird tickets have just sold out. You can still book at the standard price."
        );
        return;
      }
      if (body.error === "duplicate") {
        setError(
          "One of these participants is already booked on this session."
        );
        return;
      }
      setError(
        typeof body.error === "string" && body.error
          ? body.error
          : "Something went wrong — please try again."
      );
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (participants.length === 0) {
    return (
      <div className="rounded-xl bg-blue-pale px-4 py-4 text-sm font-semibold text-blue-dark">
        Add the people in your household who take part before booking.{" "}
        <Link href="/account" className="underline">
          Go to your account
        </Link>
      </div>
    );
  }

  const total = unitPence * selected.size;

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {participants.map((participant) => {
          const isSelected = selected.has(participant.id);
          const state = departure[participant.id];
          return (
            <li key={participant.id} className="py-3">
              <label
                className={`flex items-center gap-3 ${
                  participant.eligible && !participant.coveredByPlan
                    ? "cursor-pointer"
                    : "opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-blue)]"
                  checked={isSelected}
                  disabled={
                    !participant.eligible ||
                    participant.coveredByPlan !== null ||
                    submitting ||
                    redirecting
                  }
                  onChange={() => toggle(participant.id)}
                />
                <span className="flex-1">
                  <span className="block font-bold text-black">
                    {participant.name}
                  </span>
                  <span className="block text-sm font-semibold text-muted">
                    Age {participant.age}
                    {!participant.eligible && ` — this session is ${ageLabel}`}
                    {participant.eligible &&
                      participant.coveredByPlan &&
                      ` — already covered by ${participant.coveredByPlan}`}
                    {participant.eligible &&
                      !participant.coveredByPlan &&
                      !participant.waiverSigned &&
                      " — waiver needed"}
                  </span>
                </span>
              </label>

              {isSelected && participant.isMinor && state && (
                <div className="ml-8 mt-3 rounded-xl border border-line p-4">
                  <label className="flex items-start gap-2.5 text-sm font-semibold text-mid">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-blue"
                      checked={state.enabled}
                      disabled={submitting || redirecting}
                      onChange={(e) =>
                        patchDeparture(participant.id, { enabled: e.target.checked })
                      }
                    />
                    <span>
                      <span className="block font-bold text-black">
                        Leaving unaccompanied after this session
                      </span>
                      By default they&apos;re collected in person. Only turn
                      this on if they have permission to leave by themselves
                      this time.
                    </span>
                  </label>

                  {state.enabled && (
                    <DepartureConsentFields
                      state={state}
                      disabled={submitting || redirecting}
                      onChange={(patch) => patchDeparture(participant.id, patch)}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {unsigned.length > 0 && (
        <FormNotice tone="error">
          <span className="block">
            {unsigned.map((p) => p.name).join(", ")}{" "}
            {unsigned.length === 1 ? "needs" : "need"} a signed waiver before
            booking.
          </span>
          <Link href="/waiver" className="mt-1 inline-flex underline">
            Complete the waiver
          </Link>{" "}
          <span>— then try again below.</span>
        </FormNotice>
      )}

      {selectedMinorsIncomplete && (
        <FormNotice tone="error">
          Finish the departure consent checklist above, or turn it off, before
          booking.
        </FormNotice>
      )}

      {/* The ticket choice. Rendered only when this date actually has an
          unsold early bird allocation — every other session has one price
          and a radio group with a single option would be noise. */}
      {earlyBird && (
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-bold uppercase tracking-wide text-muted">
            Choose your ticket
          </legend>
          <div className="mt-1 space-y-2">
            <label
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                earlyBirdUsable
                  ? "cursor-pointer hover:bg-blue-pale/50"
                  : "cursor-not-allowed opacity-50"
              }`}
            >
              <input
                type="radio"
                name="ticket-tier"
                checked={usingEarlyBird}
                disabled={!earlyBirdUsable}
                onChange={() => setTier("early_bird")}
                className="h-4 w-4 accent-blue"
              />
              <span className="flex-1 font-bold text-black">
                Early bird{" "}
                <span className="text-blue">
                  {formatPrice(earlyBird.pricePence)}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-blue-pale/50">
              <input
                type="radio"
                name="ticket-tier"
                checked={!usingEarlyBird}
                onChange={() => setTier("standard")}
                className="h-4 w-4 accent-blue"
              />
              <span className="flex-1 font-bold text-black">
                Standard{" "}
                <span className="text-blue">{formatPrice(pricePence)}</span>
              </span>
            </label>
          </div>

          {/* Why the cheaper option is greyed out. Without this the form
              silently refuses the price it is still advertising. */}
          {!earlyBirdUsable && selected.size > earlyBird.remaining && (
            <p className="mt-2 px-3 text-sm font-semibold text-mid">
              There aren&apos;t enough early bird tickets for everyone
              selected. You can continue at the standard price.
            </p>
          )}
        </fieldset>
      )}

      {error && <FormNotice tone="error">{error}</FormNotice>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="font-black text-black">
          Total{" "}
          <span className="text-blue">{formatPrice(total)}</span>
          {selected.size > 0 && (
            <span className="ml-1 text-sm font-semibold text-muted">
              ({selected.size} {selected.size === 1 ? "place" : "places"})
            </span>
          )}
        </p>
        <Button
          onClick={submit}
          disabled={
            selected.size === 0 ||
            submitting ||
            redirecting ||
            selectedMinorsIncomplete
          }
        >
          {redirecting
            ? "Taking you to payment…"
            : submitting
              ? "Holding your space…"
              : "Book and pay"}
        </Button>
      </div>
    </div>
  );
}
