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
import { formatPrice } from "@/lib/format";

export type BookingFormParticipant = {
  id: string;
  name: string;
  age: number;
  eligible: boolean;
  waiverSigned: boolean;
  isMinor: boolean;
  defaultTravelMethod: string | null;
};

type UnsignedParticipant = { id: string; name: string };

type TravelMethod =
  | "walk_alone"
  | "public_transport"
  | "meet_adult_offsite"
  | "with_sibling"
  | "collected_by_other"
  | "other";

const TRAVEL_METHOD_LABELS: Record<TravelMethod, string> = {
  walk_alone: "Walks home alone",
  public_transport: "Public transport",
  meet_adult_offsite: "Meeting an adult offsite",
  with_sibling: "Leaving with a sibling",
  collected_by_other: "Collected by someone else (not the usual contact)",
  other: "Other",
};

type DepartureConsentState = {
  enabled: boolean;
  travel_method: TravelMethod;
  travel_method_other: string;
  confirm_mature: boolean;
  confirm_knows_route: boolean;
  confirm_will_inform_staff: boolean;
  confirm_accepts_responsibility: boolean;
  confirm_understands_staff_override: boolean;
};

function defaultConsentState(defaultTravelMethod: string | null): DepartureConsentState {
  const method = (
    ["walk_alone", "public_transport", "meet_adult_offsite", "with_sibling", "collected_by_other"] as const
  ).includes(defaultTravelMethod as never)
    ? (defaultTravelMethod as TravelMethod)
    : "walk_alone";
  return {
    // Pre-enabled when a default is set — the parent has told us before
    // that this is how this person usually leaves.
    enabled: Boolean(defaultTravelMethod),
    travel_method: method,
    travel_method_other: "",
    confirm_mature: false,
    confirm_knows_route: false,
    confirm_will_inform_staff: false,
    confirm_accepts_responsibility: false,
    confirm_understands_staff_override: false,
  };
}

function consentComplete(s: DepartureConsentState): boolean {
  if (!s.enabled) return true;
  if (s.travel_method === "other" && !s.travel_method_other.trim()) return false;
  return (
    s.confirm_mature &&
    s.confirm_knows_route &&
    s.confirm_will_inform_staff &&
    s.confirm_accepts_responsibility &&
    s.confirm_understands_staff_override
  );
}

export function BookingForm({
  target,
  participants,
  pricePence,
  ageLabel,
}: {
  target: { occurrence_id?: string; course_run_id?: string };
  participants: BookingFormParticipant[];
  pricePence: number;
  ageLabel: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  async function submit() {
    setSubmitting(true);
    setError(null);
    setUnsigned([]);
    try {
      const departure_consents = [...selected]
        .map((id) => ({ id, state: departure[id] }))
        .filter((d) => d.state?.enabled)
        .map((d) => ({
          participant_id: d.id,
          travel_method: d.state.travel_method,
          travel_method_other: d.state.travel_method === "other" ? d.state.travel_method_other : null,
          confirm_mature: d.state.confirm_mature,
          confirm_knows_route: d.state.confirm_knows_route,
          confirm_will_inform_staff: d.state.confirm_will_inform_staff,
          confirm_accepts_responsibility: d.state.confirm_accepts_responsibility,
          confirm_understands_staff_override: d.state.confirm_understands_staff_override,
        }));

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          participant_ids: [...selected],
          departure_consents,
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
      if (body.error === "capacity") {
        setError("Not enough spaces left on this session.");
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

  const total = pricePence * selected.size;

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
                  participant.eligible ? "cursor-pointer" : "opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-blue)]"
                  checked={isSelected}
                  disabled={!participant.eligible || submitting || redirecting}
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
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      <div>
                        <label className="block text-sm font-bold text-black">
                          How are they getting home?
                        </label>
                        <select
                          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-black"
                          value={state.travel_method}
                          disabled={submitting || redirecting}
                          onChange={(e) =>
                            patchDeparture(participant.id, {
                              travel_method: e.target.value as TravelMethod,
                            })
                          }
                        >
                          {Object.entries(TRAVEL_METHOD_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {state.travel_method === "other" && (
                        <input
                          type="text"
                          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-black"
                          placeholder="Describe how they're getting home"
                          value={state.travel_method_other}
                          disabled={submitting || redirecting}
                          onChange={(e) =>
                            patchDeparture(participant.id, {
                              travel_method_other: e.target.value,
                            })
                          }
                        />
                      )}

                      {(
                        [
                          ["confirm_mature", "I confirm they're mature enough to leave unaccompanied"],
                          ["confirm_knows_route", "I confirm they know their route home"],
                          ["confirm_will_inform_staff", "I'll inform staff before they leave"],
                          ["confirm_accepts_responsibility", "I accept responsibility once they leave the venue"],
                          ["confirm_understands_staff_override", "I understand staff can refuse to let them leave if they have concerns"],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-start gap-2.5 text-sm font-semibold text-mid"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-blue"
                            checked={state[key]}
                            disabled={submitting || redirecting}
                            onChange={(e) =>
                              patchDeparture(participant.id, { [key]: e.target.checked })
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
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
