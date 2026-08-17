// QR code generation for the in-house ticket page — replaces PassKit's
// wallet-pass barcode. Server-rendered as a data URI so the ticket page
// needs zero client JS and no CDN script (unlike the qrcodejs-via-CDN
// approach in the original mockup), and so email templates could embed
// one directly if ever needed.
import "server-only";
import QRCode from "qrcode";

/** Never-throw — a failed QR render must not break the ticket page,
 *  same fail-soft contract as lib/passkit.ts / lib/email.ts. */
export async function ticketQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, {
      width: 300,
      margin: 1,
      color: { dark: "#25406B", light: "#ffffff" },
    });
  } catch (err) {
    console.error("ticketQrDataUrl failed", url, err);
    return null;
  }
}
