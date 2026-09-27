// Empowr-cancels-the-session notice — sent from the Step 8 admin
// cancel-occurrence flow to every booking on a cancelled occurrence.
// Empowr chose the remedy (refund or credit) per booking; the member is
// told what happened, not asked. Built now so Step 8 only calls the
// orchestrator.
import {
  emailLayout,
  detailRow,
  panel,
  ctaButton,
  esc,
  EMAIL_BRAND,
} from "@/lib/email";
import { formatPrice, formatDate } from "@/lib/format";
import { membersUrl } from "@/lib/links";
import type { BookingEmailSummary, BuiltEmail, CancellationOutcome } from "./types";

export type OccurrenceCancelledEmailData = Pick<
  BookingEmailSummary,
  "offeringTitle" | "when" | "participantNames"
> & {
  outcome: CancellationOutcome;
  /** Optional line from the admin, e.g. "due to the venue closure". */
  reason?: string;
};

export function buildOccurrenceCancelledEmail(
  data: OccurrenceCancelledEmailData
): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");
  const { outcome } = data;

  const outcomeLine =
    outcome.kind === "refund"
      ? `We've submitted a card refund of <strong>${esc(
          formatPrice(outcome.amountPence)
        )}</strong> to your original payment method — no action needed. Card refunds usually land within 5–10 working days.${outcome.creditPence ? ` We have also returned ${esc(formatPrice(outcome.creditPence))} to your original credit notes, keeping their expiry dates.` : ""}`
      : `We've added <strong>${esc(
          formatPrice(outcome.amountPence)
        )}</strong> of account credit to cover it — use it towards any future booking. It expires on <strong>${esc(
          formatDate(outcome.expiresOn)
        )}</strong>.`;

  const reasonClause = data.reason ? ` ${esc(data.reason.trim())}` : "";

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("Was booked", esc(data.when)),
    detailRow("Who", names),
    detailRow(
      outcome.kind === "refund" ? "Refunded" : "Credited",
      esc(formatPrice(outcome.amountPence))
    ),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
We're really sorry — we've had to cancel this session${reasonClause}. ${outcomeLine}
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
We'd love to see ${data.participantNames.length > 1 ? "them" : "you"} at another session soon.
</p>
${ctaButton("Book another session", membersUrl("/sessions"))}
`;

  return {
    subject: `Session cancelled — ${data.offeringTitle}`,
    html: emailLayout(body, {
      preheader: `We've had to cancel ${data.offeringTitle} on ${data.when} — you've been ${
        outcome.kind === "refund" ? "refunded" : "credited"
      }.`,
      heading: "We've had to cancel a session",
    }),
  };
}
