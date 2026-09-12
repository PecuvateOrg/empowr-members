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
import type {
  BookingOrderEmailGroup,
  BookingOrderEmailSummary,
  BuiltEmail,
  EmailVenue,
} from "./types";

export function venueLines(venue: EmailVenue | null): string {
  if (!venue) return "To be confirmed";
  return [venue.name, venue.address, venue.postcode]
    .filter((value): value is string => Boolean(value))
    .map((value) => esc(value))
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

function bookingGroup(group: BookingOrderEmailGroup, showHeading: boolean): string {
  const names = group.participantNames.map(esc).join(", ");
  const summaryRows = [
    detailRow("Session", esc(group.offeringTitle)),
    detailRow("When", esc(group.when)),
    detailRow("Who", names),
    detailRow("Where", venueLines(group.venue)),
    detailRow("Paid", esc(formatPrice(group.amountPaidPence))),
  ].join("");
  const kitBlock = group.kitList
    ? `<p style="margin:16px 0 6px 0;font-size:14px;font-weight:700;color:${EMAIL_BRAND.blueDark};">What to bring</p>
<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">${esc(
        group.kitList
      ).replace(/\n/g, "<br>")}</p>`
    : "";
  const ticketButtons = group.participantNames
    .map((name, index) => ({ name, url: group.ticketUrls[index] }))
    .map(({ name, url }) =>
      ctaButton(
        group.participantNames.length > 1
          ? `View ${name.split(" ")[0]}'s ticket`
          : "View your ticket",
        url
      )
    )
    .join("");
  const heading = showHeading
    ? `<h2 style="margin:24px 0 8px 0;font-size:18px;color:${EMAIL_BRAND.blueDark};">${esc(group.offeringTitle)}</h2>`
    : "";

  return `${heading}
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
${kitBlock}
${ticketButtons}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">${cancellationPolicyLine(group.refundPolicy)}</p>`;
}

export function buildBookingConfirmationEmail(
  data: BookingOrderEmailSummary
): BuiltEmail {
  const first = data.groups[0];
  const multiple = data.groups.length > 1;
  const groups = data.groups.map((group) => bookingGroup(group, multiple)).join("");
  const paidLine = multiple
    ? `<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">You paid <strong>${esc(formatPrice(data.amountPaidPence))}</strong> for ${data.groups.length} bookings in one checkout.</p>`
    : "";

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Great news — ${multiple ? "all your bookings are" : "your booking is"} confirmed. Here are the details:
</p>
${paidLine}
${groups}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Waivers for everyone on ${multiple ? "these bookings" : "this booking"} are on file. If anything changes — a new medical note or emergency contact — update it at <a href="${links.waivers}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">waiver.empowrcic.org</a>.
</p>
${ctaButton("Browse more sessions", membersUrl("/sessions"))}
`;

  return {
    subject: multiple
      ? `Bookings confirmed — ${data.groups.length} sessions`
      : `Booking confirmed — ${first?.offeringTitle ?? "Empowr"}`,
    html: emailLayout(body, {
      preheader: multiple
        ? `${data.groups.length} bookings confirmed — ${formatPrice(data.amountPaidPence)} paid.`
        : `${first?.offeringTitle ?? "Booking"} · ${first?.when ?? ""} — you're all booked in.`,
      heading: multiple ? "Your bookings are confirmed" : "You're booked in",
    }),
  };
}
