"use client";

// Restore a booking whose payment reached Stripe but never reached this app.
//
// The input is the checkout reference straight out of the alert email, because
// that is what staff will have in front of them. They are never asked for a
// payment reference: the route reads that from Stripe itself, so a typo cannot
// restore a place somebody deliberately freed.
import { useState } from "react";
import { LifeBuoy, TriangleAlert } from "lucide-react";

type Outcome =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; restored: number; overCapacity: boolean; emailed: boolean }
  | { kind: "error"; message: string; canOverride: boolean };

export function RescueForm() {
  const [reference, setReference] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  async function run(allowOverCapacity: boolean) {
    setOutcome({ kind: "working" });
    try {
      const res = await fetch("/api/admin/rescue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkout_session_id: reference.trim(),
          allow_over_capacity: allowOverCapacity,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setOutcome({
          kind: "error",
          message: body.error ?? "Something went wrong.",
          canOverride: body.canOverride === true,
        });
        return;
      }
      setOutcome({
        kind: "done",
        restored: body.restored ?? 0,
        overCapacity: body.overCapacity === true,
        emailed: body.emailed === true,
      });
    } catch {
      setOutcome({
        kind: "error",
        message: "Could not reach the server. Check your connection.",
        canOverride: false,
      });
    }
  }

  const busy = outcome.kind === "working";

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reference.trim()) void run(false);
        }}
        className="space-y-3"
      >
        <label htmlFor="reference" className="block font-extrabold text-black">
          Checkout reference
        </label>
        <p className="text-sm text-mid">
          Copy it from the alert email — it starts with <code>cs_</code>.
        </p>
        <input
          id="reference"
          name="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="cs_live_..."
          className="w-full rounded-xl border border-line bg-white px-4 py-3 font-mono text-sm text-black disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !reference.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-blue px-6 py-3 font-extrabold text-white disabled:opacity-50"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden />
          {busy ? "Checking Stripe…" : "Restore this booking"}
        </button>
      </form>

      {outcome.kind === "done" && (
        <div
          role="status"
          className="rounded-2xl bg-blue-pale/50 p-5 text-sm text-black"
        >
          <p className="font-extrabold">
            {outcome.restored === 1
              ? "Booking restored."
              : `${outcome.restored} bookings restored.`}
          </p>
          <p className="mt-1">
            {outcome.emailed
              ? "The member has been emailed their confirmation and ticket."
              : "⚠️ The booking is restored but the confirmation email did NOT send — tell the member directly, or they hold a place they cannot see."}
          </p>
          {outcome.overCapacity && (
            <p className="mt-2 font-extrabold text-black">
              This session is now over its capacity. Tell whoever is running the
              door.
            </p>
          )}
        </div>
      )}

      {outcome.kind === "error" && (
        <div
          role="alert"
          className="rounded-2xl border border-line bg-white p-5 text-sm text-black"
        >
          <p className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-blue"
              aria-hidden
            />
            <span>{outcome.message}</span>
          </p>
          {/* Offered only when the server says this user may override. Door
              staff never see it — the server refuses them regardless, and
              showing a button that always fails is worse than none. */}
          {outcome.canOverride && (
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 font-extrabold text-black disabled:opacity-50"
            >
              Restore anyway, over capacity
            </button>
          )}
        </div>
      )}
    </div>
  );
}
