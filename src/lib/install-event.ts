"use client";

// The browser's install offer (beforeinstallprompt), shared by the install pop-up and the
// "Install the app" section on /account.
//
// Chrome fires the event once per page load, often before React has hydrated, so a listener added
// in a component effect missed it and the app showed no Install button (2026-11-17). INSTALL_CAPTURE_SCRIPT
// runs in <head> and keeps the event on window until a component asks for it.
//
// The capture does not call preventDefault(), so Chrome's own install bar still shows too: an extra way
// in beats none.

import { useEffect, useState } from "react";
import { INSTALL_READY_EVENT as READY, detectPlatform, iosBrowser, type InstallPlatform } from "@/lib/push-client";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & { __installEvent?: InstallPromptEvent | null };

/** The held install offer, or null when the browser has not made one (Safari, Firefox, already installed). */
export function useInstallEvent() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const sync = () => setEvent((window as InstallWindow).__installEvent ?? null);
    sync();
    window.addEventListener(READY, sync);
    // The push-only worker (no fetch handler, no cache) is registered on every visit, not only when
    // alerts are turned on: some browsers (Samsung Internet) will not offer install without one.
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return () => window.removeEventListener(READY, sync);
  }, []);

  async function install(): Promise<boolean> {
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    (window as InstallWindow).__installEvent = null; // an event can only be prompted once
    setEvent(null);
    return outcome === "accepted";
  }

  return { event, install };
}

/** This device: installed already, iPhone (and which browser), in-app browser, or other. Browser-only. */
export function detectHere(): { platform: InstallPlatform; safari: boolean } {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints, standalone),
    safari: iosBrowser(navigator.userAgent) === "safari",
  };
}
