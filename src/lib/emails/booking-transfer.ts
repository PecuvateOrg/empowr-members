// Member-initiated transfer notice — sent by the self-serve transfer route
// once mem_transfer_booking() has repointed the booking. Built 2026-09-17 for
// Programme Policies v1.2 §5.
//
// ⚠️ NO MONEY IS MENTIONED, and none should be. A transfer is same-offering
// by decision #3, so the price is identical and nothing is charged or
// refunded. Any "amount" line here would invent a transaction.
//
// ⚠️ THE DEPARTURE-CONSENT LINE IS THE POINT OF THIS EMAIL, not a footnote.
// A departure consent is keyed on the session date and does NOT move with the
// booking, so a parent who authorised their child to walk home from the old
// date has — correctly — authorised nothing for the new one. The door will
// default to collecting in person. A parent who assumes the arrangement
// carried would send a child expecting to leave alone. This is the only place
// that mismatch gets caught before the day, so the line is prominent, it is
// conditional on the participant being a minor ON THE NEW DATE, and it must
// not be softened into a generic "check your details" nudge.
//
// The ticket keeps working: the transfer repoints the booking in place rather
// than re-creating it, so the booking id and its QR are unchanged and the
// pass re-reads the new date. Saying so stops a member binning a valid pass.
//
// Built on lib/emails/shell.ts rather than lib/email.ts so the template stays
// pure (no Resend, no `server-only`) and can be rendered in a test.
import {
  emailLayout,
  detailRow,
  panel,
  ctaButton,
  esc,
  EMAIL_BRAND,
} from "@/lib/emails/shell";
import { membersUrl } from "@/lib/links";
import type { BookingEmailSummary, BuiltEmail } from "./types";

export type TransferEmailData = Pick<
  BookingEmailSummary,
  "offeringTitle" | "participantNames"
> & {
  oldWhen: string;
  newWhen: string;
  /** True when the participant is under 18 on the NEW date. Drives the
   *  departure-consent warning — see the header. */
  departureConsentNeeded: boolean;
};

export function buildBookingTransferEmail(data: TransferEmailData): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");
  const newWhen = esc(data.newWhen);

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("Now booked", newWhen),
    detailRow("Moved from", esc(data.oldWhen)),
    detailRow("Who", names),
  ].join("");

  const departureNotice = data.departureConsentNeeded
    ? `
<p style="margin:16px 0 0 0;padding:14px 16px;background:#FFF4E5;border-left:4px solid #B25E00;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
<strong>Please tell us again how they will leave.</strong> Departure arrangements are agreed for one session date only, so anything you told us for the old date does not carry over. Unless you complete it again for ${newWhen}, our staff will expect this person to be collected in person.
</p>`
    : "";

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Your booking has been moved. Nothing has been charged or refunded &mdash; it is the same session at a new time.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
<p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
<strong>Keep your existing ticket.</strong> The same QR code now shows the new date &mdash; there is no new pass to download.
</p>
${departureNotice}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
This booking has now used its one move. If anything else changes, email <a href="mailto:enquiries@empowrcic.org" style="color:${EMAIL_BRAND.mid};">enquiries@empowrcic.org</a>.
</p>
${ctaButton("View your bookings", membersUrl("/bookings"))}
`;

  return {
    subject: `Booking moved — ${data.offeringTitle}`,
    html: emailLayout(body, {
      preheader: `${data.offeringTitle} is now ${data.newWhen}.`,
      heading: "Your booking has moved",
    }),
  };
}
