// QR code generation, server-rendered as a data URI.
//
// Two consumers: the in-house ticket page (which replaced PassKit's
// wallet-pass barcode) and the door walk-in panel, which turns a Stripe
// Checkout URL into something a member can scan off a staff phone. Rendering
// server-side means the ticket page needs zero client JS and no CDN script
// (unlike the qrcodejs-via-CDN approach in the original mockup), and email
// templates could embed one directly if ever needed.
import "server-only";
import QRCode from "qrcode";

/** Never-throw — a failed QR render must not break the page that asked
 *  for it. At the door that matters: the walk-in panel always shows the
 *  copyable link too, so a null here degrades to typing rather than to a
 *  member who cannot pay. Same fail-soft contract as lib/email.ts. */
export async function qrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 300,
      margin: 1,
      color: { dark: "#25406B", light: "#ffffff" },
    });
  } catch (err) {
    console.error("qrDataUrl failed", url, err);
    return null;
  }
}
