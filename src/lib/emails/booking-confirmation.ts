// Booking confirmation — sent from the Stripe webhook once payment
// confirms the hold(s). Covers venue, time, kit list, cancellation
// policy and waiver status per the Phase 1 Step 6 spec.
import {
  emailLayout,
  detailRow,
  panel,
  ctaButton,
  esc,
  EMAIL_BRAND,
} from "@/lib/email";
import { formatPrice } from "@/lib/format";
import { links, membersUrl } from "@/lib/links";
import type { BookingEmailSummary, BuiltEmail, EmailVenue } from "./types";

/** Venue block: name, address, postcode — omitted lines when null. */
export function venueLines(venue: EmailVenue | null): string {
  if (!venue) return "To be confirmed";
  return [venue.name, venue.address, venue.postcode]
    .filter((v): v is string => Boolean(v))
    .map((v) => esc(v))
    .join("<br>");
}

function cancellationPolicyLine(refundPolicy: "standard" | "non_refundable"): string {
  if (refundPolicy === "non_refundable") {
    return `This session is <strong>non-refundable</strong> — spaces can't be cancelled or transferred once booked, regardless of notice given.`;
  }
  return `Bookings are final — cancellations, transfers, and refunds aren't offered by default once confirmed. Need to discuss your circumstances? Email <strong>enquiries@empowrcic.org</strong>; exceptions are considered at our discretion.`;
}

export function buildBookingConfirmationEmail(
  data: BookingEmailSummary
): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");
  const firstName = esc(data.participantNames[0]?.split(" ")[0] ?? "");
  const allSet =
    data.participantNames.length > 1
      ? "everyone's all set"
      : firstName
        ? `${firstName}'s all set`
        : "you're all set";

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("When", esc(data.when)),
    detailRow("Who", names),
    detailRow("Where", venueLines(data.venue)),
    detailRow("Paid", esc(formatPrice(data.amountPaidPence))),
  ].join("");

  const kitBlock = data.kitList
    ? `<p style="margin:16px 0 6px 0;font-size:14px;font-weight:700;color:${EMAIL_BRAND.blueDark};">What to bring</p>
<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">${esc(
        data.kitList
      ).replace(/\n/g, "<br>")}</p>`
    : "";

  // Ticket buttons — one per participant, label includes the first name
  // only when there's more than one to tell them apart.
  const ticketButtons = data.participantNames
    .map((name, i) => ({ name, url: data.ticketUrls[i] }))
    .map(({ name, url }) =>
      ctaButton(
        data.participantNames.length > 1
          ? `View ${name.split(" ")[0]}'s ticket`
          : "View your ticket",
        url
      )
    )
    .join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Great news — your booking is confirmed and ${allSet}. Here are the details:
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
${kitBlock}
${ticketButtons}
<p style="margin:16px 0 6px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
${cancellationPolicyLine(data.refundPolicy)}
</p>
<p style="margin:8px 0 16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Waivers for everyone on this booking are on file. If anything changes — a new medical note or emergency contact — update it at <a href="${links.waivers}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">waiver.empowrcic.org</a>.
</p>
${ctaButton("Browse more sessions", membersUrl("/sessions"))}
`;

  return {
    subject: `Booking confirmed — ${data.offeringTitle}`,
    html: emailLayout(body, {
      preheader: `${data.offeringTitle} · ${data.when} — you're all booked in.`,
      heading: "You're booked in",
    }),
  };
}
