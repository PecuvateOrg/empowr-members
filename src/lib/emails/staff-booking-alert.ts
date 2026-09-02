// Internal staff notification — one new paid (online) booking. Queued
// 2026-09-02 (memory.md): every sendEmail() call site sent to the member
// only, so staff had no way to learn of a booking short of opening /admin
// or seeing an unlabelled Stripe charge. Per-booking rather than a digest —
// a digest delays exactly the awareness this exists to provide.
//
// Deliberately reuses the shared shell primitives but NOT
// buildBookingConfirmationEmail() itself: that template's ticketUrls are
// per-participant credentials meant for the booking member, and this email
// is addressed to staff.
import { emailLayout, detailRow, panel, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import type { BuiltEmail, StaffBookingAlertData } from "./types";
import { venueLines } from "./booking-confirmation";

export function buildStaffBookingAlertEmail(
  data: StaffBookingAlertData
): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");

  const rows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("When", esc(data.when)),
    detailRow("Who", names),
    detailRow("Where", venueLines(data.venue)),
    detailRow("Paid", esc(formatPrice(data.amountPaidPence))),
    detailRow(
      "Booked by",
      `${esc(data.accountName)} &lt;${esc(data.accountEmail)}&gt;`
    ),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
A new booking just came in.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
`;

  return {
    subject: `New booking — ${data.offeringTitle} (${names})`,
    html: emailLayout(body, {
      preheader: `${data.offeringTitle} · ${data.when} · ${names}`,
      heading: "New booking",
    }),
  };
}
