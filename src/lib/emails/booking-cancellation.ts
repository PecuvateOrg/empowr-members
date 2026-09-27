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

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("Was booked", esc(data.when)),
    detailRow("Who", names),
    detailRow("Card refund", amount),
    ...(data.creditPence ? [detailRow("Credit returned", esc(formatPrice(data.creditPence)))] : []),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Your booking has been cancelled. ${data.amountPence > 0 ? `We&rsquo;ve submitted a refund of <strong>${amount}</strong> to your original payment method. Card refunds usually land within 5&ndash;10 working days.` : "No card payment was taken for this booking."}
${data.creditPence ? `We&rsquo;ve returned <strong>${esc(formatPrice(data.creditPence))}</strong> to your original credit notes, keeping their expiry dates. Check your account for the available balance.` : ""}
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
      preheader: `${data.offeringTitle} cancelled — ${formatPrice(data.amountPence)} refunded.`,
      heading: "Your booking is cancelled",
    }),
  };
}
