// Member-initiated cancellation notice — sent by the self-serve cancel
// route once the booking is flipped to `refunded` and Stripe has taken
// the refund. Restored 2026-09-02 for Programme Policies v1.2.
//
// Refunds preserve the original tender: card and member credit are separate.
//
// Built on lib/emails/shell.ts rather than lib/email.ts so the template
// stays pure (no Resend, no `server-only`) and can be rendered in a test.
import {
  emailLayout,
  detailRow,
  panel,
  ctaButton,
  esc,
  EMAIL_BRAND,
} from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import { membersUrl } from "@/lib/links";
import type { BookingEmailSummary, BuiltEmail } from "./types";

export type CancellationEmailData = Pick<
  BookingEmailSummary,
  "offeringTitle" | "when" | "participantNames"
> & { amountPence: number; creditPence?: number };

export function buildBookingCancellationEmail(
  data: CancellationEmailData
): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");
  const amount = esc(formatPrice(data.amountPence));
  const credit = data.creditPence ? esc(formatPrice(data.creditPence)) : "";
  // Paid entirely by credit note: no card was charged, so a "Card refund
  // £0.00" row reads like money went missing. Say how it was paid instead.
  const creditOnly = data.amountPence <= 0 && !!data.creditPence;

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("Was booked", esc(data.when)),
    detailRow("Who", names),
    ...(creditOnly ? [detailRow("Paid by", "Credit note")] : [detailRow("Card refund", amount)]),
    ...(data.creditPence ? [detailRow("Credit returned", credit)] : []),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Your booking has been cancelled. ${data.amountPence > 0 ? `We&rsquo;ve submitted a refund of <strong>${amount}</strong> to your original payment method. Card refunds usually land within 5&ndash;10 working days.` : creditOnly ? "This booking was paid for with a credit note, so there is no card refund." : "No card payment was taken for this booking."}
${data.creditPence ? `We&rsquo;ve returned <strong>${credit}</strong> to your original credit notes, keeping their expiry dates. Check your account for the available balance.` : ""}
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summaryRows}</table>`)}
<p style="margin:16px 0;font-size:14px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Changed your mind? You&rsquo;re welcome back any time.
</p>
${ctaButton("Find another session", membersUrl("/sessions"))}
`;

  return {
    subject: `Booking cancelled — ${data.offeringTitle}`,
    html: emailLayout(body, {
      preheader: creditOnly
        ? `${data.offeringTitle} cancelled — ${formatPrice(data.creditPence ?? 0)} returned to your credit.`
        : `${data.offeringTitle} cancelled — ${formatPrice(data.amountPence)} refunded.`,
      heading: "Your booking is cancelled",
    }),
  };
}
