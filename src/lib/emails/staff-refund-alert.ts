// Internal staff alert — a booking refund that did not complete. Owner
// decision 2026-09-28. Both paths only reached a Netlify function log before,
// the same unread channel that hid the 09-18 stranded payment.
//
// 🔑 A LOG IS NOT A NOTIFICATION — see staff-stranded-hold-alert.ts. Do not
// "simplify" a call site back to console.error.
import { emailLayout, detailRow, panel, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import type { BuiltEmail, StaffRefundAlertData } from "./types";

const COPY: Record<
  StaffRefundAlertData["reason"],
  { headline: string; instruction: string }
> = {
  not_accepted: {
    headline: "Refund not completed",
    instruction:
      "A member cancelled their booking, but the refund could not be " +
      "completed automatically. Their booking is cancelled and they have " +
      "been told to try again or contact us. Check Stripe for this payment: " +
      "if no refund is there, finish it from the admin refund tool. Do NOT " +
      "refund by hand in Stripe if one is already there.",
  },
  failed_later: {
    headline: "Card refund FAILED after being accepted",
    instruction:
      "Stripe accepted a card refund for this booking, then it failed. The " +
      "booking already shows as refunded, but the member's card money has " +
      "NOT gone back. Contact the member and return the money another way " +
      "(bank transfer, or credit if they agree).",
  },
};

export function buildStaffRefundAlertEmail(
  data: StaffRefundAlertData
): BuiltEmail {
  const { headline, instruction } = COPY[data.reason];
  const none = (label: string) => `<em>${label}</em>`;

  const rows = [
    detailRow("Member", data.memberEmail ? esc(data.memberEmail) : none("Unknown — look up the booking")),
    detailRow("Booking", esc(data.bookingId)),
    detailRow("Card amount", data.cardPence !== null ? esc(formatPrice(data.cardPence)) : none("Unknown")),
    detailRow("Payment", data.paymentIntentId ? esc(data.paymentIntentId) : none("None recorded")),
    detailRow("Refund", data.refundId ? esc(data.refundId) : none("None recorded")),
    detailRow("Detail", data.detail ? esc(data.detail) : none("None given")),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
${esc(instruction)}
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
<p style="margin:0;font-size:13px;line-height:1.6;color:#666;">
This alert is sent once, when it happens — please action it rather than leaving it read.
</p>
`;

  return {
    subject: `⚠️ ${headline} — action needed`,
    html: emailLayout(body, {
      preheader: `${headline} · ${data.memberEmail ?? data.bookingId}`,
      heading: headline,
    }),
  };
}
