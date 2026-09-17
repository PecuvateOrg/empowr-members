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
import {
  CANCELLATION_CUTOFF_HOURS,
  TRANSFER_CUTOFF_HOURS,
} from "@/lib/business-rules";
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
 *  The move sentence was added 2026-09-17, when transfer shipped. It was
 *  deliberately absent before that: v1.2 granted a one-time date move from
 *  09-02 but no code implemented it, and a confirmation email is the worst
 *  place to promise a button that does not exist.
 *
 *  ⚠️ GATED ON THE SAME THREE CONDITIONS AS PolicyNotice AND
 *  evaluateTransferPolicy, in the same order. The move right is per-offering:
 *  Roller Quad Camp and All Ages Roller Disco do not have it, and courses
 *  are sold as a block so they never get it either. Do NOT flatten this into
 *  one sentence for everyone — that promises a move the member will not be
 *  offered, in writing, after they have paid. */
function cancellationPolicyLine(
  refundPolicy: "standard" | "non_refundable",
  transferable: boolean,
  enrolmentScope: "per_occurrence" | "per_run"
): string {
  if (refundPolicy === "non_refundable") {
    return `This session is <strong>non-refundable</strong> — it can't be cancelled or moved once booked, whatever notice is given.`;
  }

  const moveLine =
    transferable && enrolmentScope === "per_occurrence"
      ? ` You can also move it once to another date of the same session, as long as both dates are at least ${TRANSFER_CUTOFF_HOURS} hours away.`
      : "";

  // A course is cancellable, but the cutoff runs from the start of the
  // COURSE, not of a single class — and individual classes inside it can
  // never be moved or cancelled separately (Programme Policies v1.2 §5).
  if (enrolmentScope === "per_run") {
    return `Need to cancel? You can cancel this course yourself from <a href="${membersUrl(
      "/bookings"
    )}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">your bookings</a> up to <strong>${CANCELLATION_CUTOFF_HOURS} hours</strong> before the course begins, and we'll refund the full amount to your card. Individual classes inside a course can't be moved or cancelled separately — it's sold as a block.`;
  }

  return `Need to cancel? You can cancel this booking yourself from <a href="${membersUrl(
    "/bookings"
  )}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">your bookings</a> up to <strong>${CANCELLATION_CUTOFF_HOURS} hours</strong> before the session, and we'll refund the full amount to your card. Inside ${CANCELLATION_CUTOFF_HOURS} hours we can't refund the space.${moveLine}`;
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
  // Each ticket carries its own name, so the label can only ever come from
  // the row the URL belongs to. A nameless row still gets its ticket —
  // dropping it would strand a paid-for place with no way in.
  const ticketButtons = group.tickets
    .map(({ name, url }) => {
      const firstName = name.trim().split(" ")[0];
      const label =
        group.tickets.length > 1
          ? firstName
            ? `View ${firstName}'s ticket`
            : "View ticket"
          : "View your ticket";
      return ctaButton(label, url);
    })
    .join("");
  const heading = showHeading
    ? `<h2 style="margin:24px 0 8px 0;font-size:18px;color:${EMAIL_BRAND.blueDark};">${esc(group.offeringTitle)}</h2>`
    : "";

  return `${heading}
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
${kitBlock}
${ticketButtons}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">${cancellationPolicyLine(group.refundPolicy, group.transferable, group.enrolmentScope)}</p>`;
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
