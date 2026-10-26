"use client";

// The "Alerts" card on the account page. Explains first, asks only when the button is tapped.
import { Bell, BellOff } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import { usePushAlerts } from "@/components/messaging/usePushAlerts";

// Owner wording 2026-10-26: short, and a catch-all (alerts cover changes, cancellations and more).
export const ALERTS_HEADLINE = "Stay in the loop";
export const ALERTS_EXPLAINER = "Get instant alerts about your sessions and bookings straight to your phone.";

export function PushAlerts() {
  const { state, error, turnOn, turnOff } = usePushAlerts();

  if (state === "checking") return <p className="text-sm text-mid">Checking alerts...</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-mid">{ALERTS_EXPLAINER}</p>

      {state === "unavailable" && <p className="text-sm font-semibold text-mid">Alerts are not available yet. Messages still arrive by email and in your account.</p>}
      {state === "unsupported" && <p className="text-sm font-semibold text-mid">This browser cannot show alerts. Messages still arrive by email and in your account.</p>}
      {state === "needs-install" && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          On iPhone and iPad, alerts only work once Empowr Members is on your home screen (iOS 16.4 or newer). Tap the Share
          button in Safari, choose Add to Home Screen, then open it from there and come back to this page.
        </p>
      )}
      {state === "denied" && (
        <p className="text-sm font-semibold text-mid">
          Alerts are blocked for this site. To turn them on, allow notifications for Empowr Members in your browser or phone
          settings, then come back here.
        </p>
      )}

      {state === "off" && (
        <Button type="button" onClick={turnOn} className="inline-flex min-h-11 items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden /> Turn on alerts
        </Button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-black">
            <Bell className="h-4 w-4 text-blue" aria-hidden /> Alerts are on for this device
          </p>
          <Button type="button" variant="secondary" onClick={turnOff} className="inline-flex min-h-11 items-center gap-2">
            <BellOff className="h-4 w-4" aria-hidden /> Turn off
          </Button>
        </div>
      )}

      {error && <FormNotice tone="error">{error}</FormNotice>}
      <p className="text-xs font-semibold text-mid">
        Alerts are per device. Turn them on in each browser or phone you use. iPhone alerts need the home-screen app (iOS 16.4+).
      </p>
    </div>
  );
}
