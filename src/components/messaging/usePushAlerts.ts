"use client";

// Phone alerts: the one place that talks to the service worker, the Notification permission and
// /api/push/subscribe. Shared by the account page card and the install banner.
//
// PERMISSION IS ASKED ONLY ON A TAP (`turnOn`). Nothing here prompts on load - browsers penalise that and
// people refuse it - and mounting only READS the current state.
import { useCallback, useEffect, useState } from "react";
import { detectPlatform, urlBase64ToUint8Array } from "@/lib/push-client";

export type PushState =
  | "checking"
  /** This browser cannot do push at all. */
  | "unsupported"
  /** iPhone/iPad outside the home-screen app: push only works once added to the home screen (iOS 16.4+). */
  | "needs-install"
  /** No VAPID public key in this build. */
  | "unavailable"
  | "denied"
  | "off"
  | "on";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** `api` is where this device's subscription is stored: members use /api/push/subscribe, admin
 *  alerts /api/admin/push/subscribe. Both share ONE browser subscription (one service worker at
 *  scope /), so "on" means the browser has it AND that api has stored it, and turning off deletes
 *  only that api's row - never the browser subscription, which would silence the other side too. */
export function usePushAlerts(api = "/api/push/subscribe") {
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!PUBLIC_KEY) return setState("unavailable");
    const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints, isStandalone());
    const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!capable) return setState(platform === "ios-browser" ? "needs-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription || Notification.permission !== "granted") return setState("off");
      const response = await fetch(`${api}?endpoint=${encodeURIComponent(subscription.endpoint)}`);
      const stored = response.ok && ((await response.json()) as { on?: boolean }).on === true;
      setState(stored ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = useCallback(async () => {
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        }));
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      // The browser subscription is kept even if saving fails: the other side (member or admin
      // alerts) may be using it. Unstored, it receives nothing.
      if (!response.ok) throw new Error("save failed");
      setState("on");
    } catch {
      setError("We could not turn on alerts. Please try again.");
      void refresh();
    }
  }, [api, refresh]);

  const turnOff = useCallback(async () => {
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(api, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("delete failed");
      }
      setState("off");
    } catch {
      setError("We could not turn off alerts. Please try again.");
    }
  }, [api]);

  return { state, error, turnOn, turnOff };
}
