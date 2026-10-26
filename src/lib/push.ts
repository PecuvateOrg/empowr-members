// Web Push transport (VAPID). Server-only.
//
// Pushing is OPTIONAL and must never break a send: with the VAPID keys unset every function here is a
// quiet no-op, so the feature can ship before the keys are in Netlify and email + inbox work regardless.
//
// The payload is deliberately small and carries only what the lock screen shows (title = subject, body =
// first line, url) - never recipient lists or anything else.
import "server-only";
import webpush from "web-push";
import type { PushPayload } from "@/lib/message-core";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** sent = accepted by the push service; gone = 404/410, the subscription is dead and should be deleted;
 *  failed = anything else (try again next message); disabled = keys not configured. */
export type PushOutcome = "sent" | "gone" | "failed" | "disabled";

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured === null) {
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:bookings@empowrcic.org";
    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        configured = true;
      } catch (err) {
        console.error("VAPID keys are set but invalid - push disabled", err instanceof Error ? err.message : err);
        configured = false;
      }
    } else {
      configured = false;
    }
  }
  return configured;
}

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  if (!pushConfigured()) return "disabled";
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      // Urgent messages ask the push service for prompt delivery; a day is plenty for the rest.
      { TTL: 60 * 60 * 24, urgency: payload.urgent ? "high" : "normal", timeout: 8000 }
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("push failed", status ?? "", err instanceof Error ? err.message : err);
    return "failed";
  }
}
