// Member-initiated cancellation notice — sent by the self-serve cancel
// route once the booking is flipped to `refunded` and Stripe has taken
// the refund. Restored 2026-09-02 for Programme Policies v1.2.
//
// ⚠️ Refund only. The v1.1-era version of this template also had a
// credit branch; it is gone because credit redemption (Phase 2 Step 5)
// is unbuilt — see lib/cancellation.ts. Do not reinstate the credit copy
// before something actually reads mem_credits.
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
> & { amountPence: number };

export function buildBookingCancellationEmail(
  data: CancellationEmailData
): BuiltEmail {
  const names = data.participantNames.map(esc).join(", ");
  const amount = esc(formatPrice(data.amountPence));

  const summaryRows = [
    detailRow("Session", esc(data.offeringTitle)),
    detailRow("Was booked", esc(data.when)),
    detailRow("Who", names),
    detailRow("Refunded", amount),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">
Your booking has been cancelled. We&rsquo;ve refunded <strong>${amount}</strong> to your original payment method. Card refunds usually land within 5&ndash;10 working days.
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
