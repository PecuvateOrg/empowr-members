"use client";

import { Bell, BellOff } from "lucide-react";
import { Button, FormNotice } from "@/components/ui/form";
import { usePushAlerts } from "@/components/messaging/usePushAlerts";

/** Admin phone alerts for new Inbox messages, per device. Separate from this person's member alerts. */
export function StaffAlertsToggle() {
  const { state, error, turnOn, turnOff } = usePushAlerts("/api/admin/push/subscribe");
  if (state === "checking") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-extrabold text-black">
          <Bell className="h-4 w-4 text-blue" aria-hidden /> Phone alerts for new messages
        </p>
        <p className="text-sm text-mid">
          {state === "on" && "On for this device."}
          {state === "off" && "Get a notification on this device when a member writes in."}
          {state === "needs-install" &&
            "On iPhone, add Empowr Admin to your home screen first: Share, then Add to Home Screen. Open it from there and come back here."}
          {state === "denied" && "Notifications are blocked for this site. Allow them in your browser or phone settings."}
          {(state === "unsupported" || state === "unavailable") && "This browser cannot show notifications."}
        </p>
      </div>
      {state === "off" && (
        <Button type="button" onClick={turnOn} className="inline-flex min-h-11 items-center gap-2">
          <Bell className="h-4 w-4" aria-hidden /> Turn on
        </Button>
      )}
      {state === "on" && (
        <Button type="button" variant="secondary" onClick={turnOff} className="inline-flex min-h-11 items-center gap-2">
          <BellOff className="h-4 w-4" aria-hidden /> Turn off
        </Button>
      )}
      {error && <FormNotice tone="error">{error}</FormNotice>}
    </div>
  );
}
