// Booking confirmation — sent from the Stripe webhook once payment
// confirms the hold(s). Covers venue, time, kit list, cancellation
// policy and waiver status per the Phase 1 Step 6 spec.
//
// Imports the shell from lib/emails/shell.ts, NOT lib/email.ts. The two
// export the same symbols (email.ts re-exports them), but email.ts also
// carries `import "server-only"` and pulls in Resend, which makes this
// template unrenderable outside a request — including by a script that
// just wants to read the copy back. Switched 2026-09-02 while changing
// the cancellation paragraph, for exactly that reason.
import {
  emailLayout,
  detailRow,
  panel,
  ctaButton,
  esc,
  EMAIL_BRAND,
} from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import { links, membersUrl } from "@/lib/links";
import { CANCELLATION_CUTOFF_HOURS } from "@/lib/business-rules";
import type { BookingEmailSummary, BuiltEmail, EmailVenue } from "./types";

/** Venue block: name, address, postcode — omitted lines when null. */
export function venueLines(venue: EmailVenue | null): string {
  if (!venue) return "To be confirmed";
  return [venue.name, venue.address, venue.postcode]
    .filter((v): v is string => Boolean(v))
    .map((v) => esc(v))
    .join("<br>");
}

/** Post-purchase restatement of Programme Policies v1.2 §5. Reinstated
 *  2026-09-02 when self-serve cancellation shipped — this paragraph was
 *  removed 2026-08-19 because under v1.1 there was no control to point at.
 *
 *  ⚠️ Says nothing about moving a booking to another date. v1.2 grants
 *  that, but transfer is Phase C and unbuilt; a confirmation email is the
 *  worst place to promise a button that does not exist. Add it with the
 *  transfer UI, not before. Keep this in step with PolicyNotice. */
function cancellationPolicyLine(
  refundPolicy: "standard" | "non_refundable"
): string {
  if (refundPolicy === "non_refundable") {
    return `This session is <strong>non-refundable</strong> — it can't be cancelled or moved once booked, whatever notice is given.`;
  }
  return `Need to cancel? You can cancel this booking yourself from <a href="${membersUrl(
    "/bookings"
  )}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">your bookings</a> up to <strong>${CANCELLATION_CUTOFF_HOURS} hours</strong> before the session, and we'll refund the full amount to your card. Inside ${CANCELLATION_CUTOFF_HOURS} hours we can't refund the space.`;
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
<p style="margin:16px 0 16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Waivers for everyone on this booking are on file. If anything changes — a new medical note or emergency contact — update it at <a href="${links.waivers}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">waiver.empowrcic.org</a>.
</p>
<p style="margin:16px 0 16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
${cancellationPolicyLine(data.refundPolicy)}
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
