// Internal staff alert — a Stripe checkout that needs a human, because the
// app could not finish it automatically. Added 2026-09-18 after a member
// paid for a session, held no booking, appeared on no register, and NOTHING
// told anyone: the webhook wrote a console.error into a Netlify function log
// that is live-only and unread. The customer had to complain to surface it.
//
// 🔑 THE POINT OF THIS FILE IS THAT A LOG IS NOT A NOTIFICATION. Every
// branch that routes here already logged; logging more loudly would have
// changed nothing. If you are tempted to "simplify" one of these call sites
// back to a console.error, that is the exact regression this exists to undo.
//
// Deliberately reuses the shared shell but is NOT modelled on
// buildStaffBookingAlertEmail: that one reports a success and can afford to
// be one of many. This reports money taken against nothing, is rare by
// design, and leads with the instruction rather than the detail.
import { emailLayout, detailRow, panel, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import type { BuiltEmail, StaffStrandedHoldAlertData } from "./types";

/** What staff are being told, per reason. `headline` goes in the subject,
 *  `instruction` is the first thing in the body. Both are deliberately
 *  written for someone who has not read any of the above. */
const COPY: Record<
  StaffStrandedHoldAlertData["reason"],
  { headline: string; instruction: string }
> = {
  paid_holds_released: {
    headline: "Payment taken, no booking",
    instruction:
      "A member has been charged, but the places they were paying for had " +
      "already been released before the payment landed. They hold NO " +
      "booking and will not appear on any register. Refund them, or rebook " +
      "them onto the session and keep the payment.",
  },
  check_failed: {
    headline: "Payment taken, booking status unknown",
    instruction:
      "A member has been charged. The check that would confirm whether " +
      "their places survived could not be run, so we do not know whether " +
      "they hold a booking. Look this member up in the admin area and " +
      "confirm by hand — do not assume either way.",
  },
  completed_unpaid: {
    headline: "Checkout closed without payment settling",
    instruction:
      "Stripe closed this checkout without the payment settling. This app " +
      "only confirms card payments, which settle immediately, so nothing " +
      "here will confirm this booking later. If the payment does go " +
      "through, the member will have been charged with no booking and no " +
      "further warning. Check Stripe for this payment.",
  },
};

export function buildStaffStrandedHoldAlertEmail(
  data: StaffStrandedHoldAlertData
): BuiltEmail {
  const { headline, instruction } = COPY[data.reason];

  // Bookings are listed rather than counted: staff need the ids to find the
  // member, and the status each was found in is what distinguishes a
  // released hold from something stranger. "None readable" is stated
  // outright so an empty list can never be mistaken for "nothing wrong".
  const bookingList =
    data.bookings.length > 0
      ? data.bookings
          .map((b) => `${esc(b.id)} (${esc(b.status)})`)
          .join("<br>")
      : "<em>None readable — see the reason above</em>";

  const rows = [
    detailRow(
      "Member",
      data.memberEmail ? esc(data.memberEmail) : "<em>Not on the checkout</em>"
    ),
    detailRow(
      "Amount",
      data.amountPence !== null
        ? esc(formatPrice(data.amountPence))
        : "<em>Unknown</em>"
    ),
    detailRow("Bookings", bookingList),
    detailRow("Checkout", esc(data.checkoutSessionId)),
    detailRow(
      "Payment",
      data.paymentIntentId ? esc(data.paymentIntentId) : "<em>None recorded</em>"
    ),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
${esc(instruction)}
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
<p style="margin:0;font-size:13px;line-height:1.6;color:#666;">
Search the Checkout or Payment reference above in Stripe to see the money.
This alert is sent once, when it happens — it is not repeated and there is
no queue holding it, so please action it rather than leaving it read.
</p>
`;

  return {
    subject: `⚠️ ${headline} — action needed`,
    html: emailLayout(body, {
      preheader: `${headline} · ${data.memberEmail ?? "unknown member"}`,
      heading: headline,
    }),
  };
}
