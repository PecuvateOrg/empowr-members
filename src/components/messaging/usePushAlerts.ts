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

export function usePushAlerts() {
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
      setState(subscription && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

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
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        // Do not leave a browser subscription the server does not know about.
        await subscription.unsubscribe();
        throw new Error("save failed");
      }
      setState("on");
    } catch {
      setError("We could not turn on alerts. Please try again.");
      void refresh();
    }
  }, [refresh]);

  const turnOff = useCallback(async () => {
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("delete failed");
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("We could not turn off alerts. Please try again.");
    }
  }, []);

  return { state, error, turnOn, turnOff };
}
