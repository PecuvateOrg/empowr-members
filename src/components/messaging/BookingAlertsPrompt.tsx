"use client";

// Shown on the booking confirmation page: the moment a family most wants to hear if that session changes.
// Browsers only allow alerts after the person taps Allow, so this explains why and asks on the button tap.
// Renders nothing once alerts are on, blocked or impossible on this device - email and the inbox still reach them.
import { Bell, Share } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import { usePushAlerts } from "@/components/messaging/usePushAlerts";

export function BookingAlertsPrompt() {
  const { state, error, turnOn } = usePushAlerts();
  if (state !== "off" && state !== "needs-install") return null;

  return (
    <section aria-label="Session alerts" className="mt-4 rounded-2xl border border-line bg-card p-5 text-left">
      <h2 className="flex items-center gap-2 font-extrabold text-black">
        <Bell className="h-5 w-5 text-blue" aria-hidden /> Want to hear straight away if this session changes?
      </h2>
      <p className="mt-2 text-sm text-mid">
        If a time changes, a session is cancelled on the day or there&apos;s something you need to bring, we&apos;ll send an
        alert to your phone. We only use alerts for your bookings, never for marketing, and you can turn them off any time
        in your account.
      </p>
      {state === "needs-install" ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            On iPhone, first add Empowr Members to your home screen: tap Share in Safari, then Add to Home Screen. Open it
            from there and turn on alerts in your account.
          </span>
        </p>
      ) : (
        <Button type="button" onClick={turnOn} className="mt-3 inline-flex min-h-11 items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden /> Turn on alerts
        </Button>
      )}
      {error && <div className="mt-3"><FormNotice tone="error">{error}</FormNotice></div>}
    </section>
  );
}
