// Internal staff notification — a new Subscription. Sibling to
// staff-booking-alert.ts, and deliberately a SEPARATE template rather than
// a variant of it: a subscription has no session date/venue and recurs
// monthly, so the fields genuinely differ, not just the wording.
//
// One per subscribe event ONLY. Phase 2 Step 4 materialises a booking row
// per future occurrence a subscriber is entitled to — sometimes dozens in
// one reconciliation pass — and this must never fire from that path, or one
// subscribe would flood the inbox with one email per occurrence instead of
// the one email per real event this exists to provide.
import { emailLayout, detailRow, panel, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import type { BuiltEmail, StaffSubscriptionAlertData } from "./types";

export function buildStaffSubscriptionAlertEmail(
  data: StaffSubscriptionAlertData
): BuiltEmail {
  const rows = [
    detailRow("Plan", esc(data.planName)),
    detailRow("For", esc(data.participantName)),
    detailRow("Price", `${esc(formatPrice(data.pricePence))} / month`),
    detailRow(
      "Subscribed by",
      `${esc(data.accountName)} &lt;${esc(data.accountEmail)}&gt;`
    ),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
A new subscription just started.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
`;

  return {
    subject: `New subscription — ${data.planName} (${data.participantName})`,
    html: emailLayout(body, {
      preheader: `${data.planName} · ${data.participantName}`,
      heading: "New subscription",
    }),
  };
}
