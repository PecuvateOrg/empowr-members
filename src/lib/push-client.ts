// Browser-side helpers for installing the app and turning on alerts. Pure (no window access at import),
// so the verify suite can exercise them.

export const INSTALL_DISMISS_DAYS = 30;
export const INSTALL_DISMISS_KEY = "members-install-banner-dismissed-at";

/** VAPID public key (base64url) to the bytes pushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type InstallPlatform =
  /** Running as an installed app already. */
  | "standalone"
  /** iPhone/iPad in Safari or another browser: no install prompt exists, show the Share tip. */
  | "ios-browser"
  /** Everything else; the browser may offer its own install prompt (beforeinstallprompt). */
  | "other";

export function detectPlatform(userAgent: string, maxTouchPoints: number, standalone: boolean): InstallPlatform {
  if (standalone) return "standalone";
  // iPadOS 13+ reports as a Mac, so a "Mac" with a touch screen is an iPad.
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios ? "ios-browser" : "other";
}

/** The banner stays hidden for 30 days after it is dismissed. An unreadable or future timestamp counts as
 *  "not dismissed" - showing the banner once too often beats hiding it for ever. */
export function isDismissed(dismissedAtMs: number | null, nowMs: number): boolean {
  if (dismissedAtMs === null || !Number.isFinite(dismissedAtMs) || dismissedAtMs > nowMs) return false;
  return nowMs - dismissedAtMs < INSTALL_DISMISS_DAYS * 86_400_000;
}
