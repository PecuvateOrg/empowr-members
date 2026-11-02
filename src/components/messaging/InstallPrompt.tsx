"use client";

// The install + alerts pop-up across the member area (owner, 2026-11-02; replaced InstallBanner,
// which members scrolled past). A modal <dialog>: the page behind is inert until the member installs
// the app, turns on alerts, or chooses Not now / X / Esc, which hides it for INSTALL_DISMISS_DAYS.
//
// When it does NOT appear:
// - mid-transaction (basket, booking, waiver, account deletion) - never interrupt a checkout;
// - before the cookie banner has been answered, so two overlays never stack;
// - when there is nothing it could do: installed with alerts on, alerts blocked, an in-app browser
//   (Instagram, Facebook) that can neither install nor notify, or a browser with no install prompt;
// - when localStorage is unavailable (private windows): a "Not now" could never stick there, so
//   showing it would mean showing it on every visit.
//
// iPhone: alerts only work once the app is on the home screen, so in Safari the pop-up gives the
// Add to Home Screen steps; the alerts offer comes when they open the installed app.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/form";
import { ALERTS_EXPLAINER } from "@/components/messaging/PushAlerts";
import { usePushAlerts } from "@/components/messaging/usePushAlerts";
import { INSTALL_DISMISS_KEY, detectPlatform, isDismissed, type InstallPlatform } from "@/lib/push-client";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const CONSENT_KEY = "empowr-members_analytics_consent"; // CookieConsentBanner
const NEVER_ON = ["/basket", "/book", "/waiver", "/account/delete"];

// The same pop-up for the admin area (2026-11-02), with its own wording, its own "Not now" and
// alerts stored as staff alerts (new Inbox messages) rather than member alerts.
const COPY = {
  member: {
    dismissKey: INSTALL_DISMISS_KEY,
    pushApi: "/api/push/subscribe",
    title: "Get the Empowr app",
    pitch: "Your bookings and tickets one tap away, and alerts if a session changes.",
    alerts: ALERTS_EXPLAINER,
    appName: "Empowr",
  },
  admin: {
    dismissKey: "admin-install-prompt-dismissed-at",
    pushApi: "/api/admin/push/subscribe",
    title: "Get the Empowr Admin app",
    pitch: "The admin area one tap away, and an alert on this device when a member writes in.",
    alerts: "Get a notification on this device when a member sends a message through the contact form.",
    appName: "Empowr Admin",
  },
} as const;

export function InstallPrompt({ variant = "member" }: { variant?: keyof typeof COPY }) {
  const copy = COPY[variant];
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [eligible, setEligible] = useState(false);
  const [consentDone, setConsentDone] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const push = usePushAlerts(copy.pushApi);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints, standalone));
    try {
      const raw = window.localStorage.getItem(copy.dismissKey);
      setEligible(!isDismissed(raw === null ? null : Number(raw), Date.now()));
    } catch {
      setEligible(false);
    }

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
  }, [copy.dismissKey]);

  // The cookie banner writes its choice in this same tab, which fires no storage event: poll.
  useEffect(() => {
    const check = () => {
      try {
        return Boolean(window.localStorage.getItem(CONSENT_KEY));
      } catch {
        return false;
      }
    };
    if (check()) return setConsentDone(true);
    const timer = window.setInterval(() => {
      if (check()) {
        setConsentDone(true);
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const offerIosSteps = platform === "ios-browser";
  const offerInstall = platform === "other" && installEvent !== null;
  const offerAlerts = push.state === "off" && platform !== "ios-browser" && platform !== "in-app";
  const blockedHere = NEVER_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const open =
    !closed && eligible && consentDone && !blockedHere && push.state !== "checking" && (offerIosSteps || offerInstall || offerAlerts);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function notNow() {
    setClosed(true);
    try {
      window.localStorage.setItem(copy.dismissKey, String(Date.now()));
    } catch {
      // hidden for this visit only
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted" && !offerAlerts) setClosed(true);
  }

  async function alertsOn() {
    await push.turnOn();
    setClosed(true);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="install-prompt-title"
      onCancel={(e) => {
        e.preventDefault();
        notNow();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl bg-card p-0 text-black shadow-xl backdrop:bg-black/60"
    >
      <div className="relative p-6 pt-8">
        <button
          type="button"
          onClick={notNow}
          aria-label="Not now"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-mid outline-none hover:bg-warm-white hover:text-black focus-visible:ring-2 focus-visible:ring-blue"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {/* showModal() focuses the first focusable element, which put a ring on the X; start on the title. */}
        <h2 id="install-prompt-title" tabIndex={-1} autoFocus className="pr-10 text-2xl font-black tracking-tight outline-none">
          {offerIosSteps || offerInstall ? copy.title : "Turn on alerts"}
        </h2>
        <p className="mt-2 text-mid">
          {offerIosSteps || offerInstall
            ? copy.pitch
            : copy.alerts}
        </p>

        {offerIosSteps && (
          <ol className="mt-5 space-y-3 text-sm font-semibold">
            <li className="flex items-center gap-3">
              <Share className="h-5 w-5 shrink-0 text-blue" aria-hidden /> Tap the Share button in Safari
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus className="h-5 w-5 shrink-0 text-blue" aria-hidden /> Choose Add to Home Screen
            </li>
            <li className="flex items-center gap-3">
              <Bell className="h-5 w-5 shrink-0 text-blue" aria-hidden /> Open {copy.appName} from your home screen to turn on alerts
            </li>
          </ol>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {offerInstall && (
            <Button type="button" onClick={install} className="inline-flex min-h-12 items-center justify-center gap-2">
              <Download className="h-4 w-4" aria-hidden /> Install the app
            </Button>
          )}
          {offerAlerts && (
            <Button
              type="button"
              variant={offerInstall ? "secondary" : "primary"}
              onClick={alertsOn}
              className="inline-flex min-h-12 items-center justify-center gap-2"
            >
              <Bell className="h-4 w-4" aria-hidden /> Turn on alerts
            </Button>
          )}
          <button type="button" onClick={notNow} className="min-h-11 text-sm font-bold text-mid underline underline-offset-2 hover:text-black">
            {offerIosSteps ? "Done, or not now" : "Not now"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
