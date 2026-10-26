"use client";

// A dismissible banner at the top of the member area offering (1) install as an app and (2) phone alerts.
//
// INLINE, NOT FIXED. The bottom bar and the cookie banner already fight over the bottom edge of a phone
// (see CookieConsentBanner); a third fixed layer is how they end up covering each other.
//
// - Android / desktop Chrome: captures `beforeinstallprompt` and offers "Install app" - the browser prompt is
//   only shown on that tap.
// - iPhone / iPad: there is no install prompt, so it shows "Tap Share, then Add to Home Screen".
// - Already installed (standalone): only the alerts offer, if alerts are not on yet.
// - Dismissed = hidden for 30 days (localStorage, every access wrapped: it throws in some private windows).
import { useEffect, useState } from "react";
import { Bell, Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/form";
import { ALERTS_EXPLAINER, ALERTS_HEADLINE } from "@/components/messaging/PushAlerts";
import { usePushAlerts } from "@/components/messaging/usePushAlerts";
import { INSTALL_DISMISS_KEY, detectPlatform, isDismissed, type InstallPlatform } from "@/lib/push-client";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallBanner() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [dismissed, setDismissed] = useState(true); // hidden until we have checked
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const push = usePushAlerts();

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints, standalone));
    let stored: number | null = null;
    try {
      const raw = window.localStorage.getItem(INSTALL_DISMISS_KEY);
      stored = raw === null ? null : Number(raw);
    } catch {
      // storage unavailable: treat as not dismissed
    }
    setDismissed(isDismissed(stored, Date.now()));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // hidden for this visit only
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  if (dismissed || platform === null) return null;

  const showIosTip = platform === "ios-browser";
  const showInstall = platform === "other" && installEvent !== null;
  // iPhone cannot do alerts until installed, so on iOS the tip IS the offer.
  const showAlerts = push.state === "off";
  if (!showIosTip && !showInstall && !showAlerts) return null;

  return (
    <aside aria-label="Install the app" className="mx-auto mt-4 w-full max-w-4xl px-4 sm:px-6">
      <div className="relative rounded-2xl border border-blue/30 bg-blue-pale p-4 pr-12 text-blue-dark">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this for 30 days"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/60"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {showIosTip && (
          <p className="flex items-start gap-2 text-sm font-semibold">
            <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Put Empowr Members on your home screen: tap Share, then Add to Home Screen. Then you can get alerts about your
              bookings.
            </span>
          </p>
        )}
        {showInstall && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold">Install Empowr Members as an app on this device.</p>
            <Button type="button" onClick={install} className="inline-flex min-h-11 items-center gap-2">
              <Download className="h-4 w-4" aria-hidden /> Install app
            </Button>
          </div>
        )}
        {showAlerts && (
          <div className={`flex flex-wrap items-center gap-3 ${showIosTip || showInstall ? "mt-3" : ""}`}>
            <p className="text-sm">
              <span className="block font-extrabold">{ALERTS_HEADLINE}</span>
              {ALERTS_EXPLAINER}
            </p>
            <Button type="button" onClick={push.turnOn} className="inline-flex min-h-11 items-center gap-2">
              <Bell className="h-4 w-4" aria-hidden /> Turn on alerts
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
