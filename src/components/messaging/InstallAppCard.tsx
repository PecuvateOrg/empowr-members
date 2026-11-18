"use client";

// "Install the app" on /account (2026-11-17). Always there, unlike the pop-up, which hides for 7 days
// after "Not now" and stays away entirely when the browser makes no install offer. Says what to do on
// every kind of phone, including the in-app browsers (Gmail, Instagram, the Google app) that cannot install.

import { useEffect, useState } from "react";
import { CheckCircle2, Download, EllipsisVertical, ExternalLink, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/form";
import type { InstallPlatform } from "@/lib/push-client";
import { detectHere, useInstallEvent } from "@/lib/install-event";

function Step({ icon: Icon, children }: { icon: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <Icon className="h-5 w-5 shrink-0 text-blue" aria-hidden /> <span>{children}</span>
    </li>
  );
}

export function InstallAppCard() {
  const { event, install } = useInstallEvent();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [safari, setSafari] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const here = detectHere();
    setPlatform(here.platform);
    setSafari(here.safari);
  }, []);

  if (platform === null) return null;

  if (platform === "standalone" || done) {
    return (
      <p className="flex items-center gap-2 font-semibold text-black">
        <CheckCircle2 className="h-5 w-5 text-blue" aria-hidden /> You&apos;re using the Empowr app on this device.
      </p>
    );
  }

  if (platform === "in-app") {
    return (
      <ol className="space-y-3 text-sm font-semibold text-black">
        <Step icon={ExternalLink}>
          This page is open inside another app, which can&apos;t install apps. Open the menu (⋯ or ⋮) and choose
          Open in browser (Safari or Chrome).
        </Step>
        <Step icon={Download}>Sign in there and come back to this page to install.</Step>
      </ol>
    );
  }

  if (platform === "ios-browser") {
    return (
      <ol className="space-y-3 text-sm font-semibold text-black">
        <Step icon={Share}>
          {safari ? "Tap the Share button at the bottom of Safari" : "Tap the Share button in the address bar"}
        </Step>
        <Step icon={SquarePlus}>Scroll down and choose Add to Home Screen, then Add</Step>
        <li className="pt-1 font-normal text-mid">
          No Add to Home Screen option? You may be in a preview opened from another app (such as Gmail): tap the
          compass or &quot;Open in Safari&quot; first.
        </li>
      </ol>
    );
  }

  if (event) {
    return (
      <Button
        type="button"
        onClick={async () => setDone(await install())}
        className="inline-flex min-h-12 items-center justify-center gap-2"
      >
        <Download className="h-4 w-4" aria-hidden /> Install the app
      </Button>
    );
  }

  // Android or desktop with no install offer: Firefox, Samsung Internet, or Chrome before it is ready.
  return (
    <ol className="space-y-3 text-sm font-semibold text-black">
      <Step icon={EllipsisVertical}>Open your browser&apos;s menu (⋮ or ≡)</Step>
      <Step icon={Download}>Choose Install app or Add to Home screen</Step>
      <li className="pt-1 font-normal text-mid">
        Don&apos;t see it? It may already be installed: look for Empowr on your home screen. Otherwise open this page
        in Chrome.
      </li>
    </ol>
  );
}
