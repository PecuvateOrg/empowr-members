// Internal staff notification — a subscription plan is now entitling more
// than the one weekly slot its name promises. Sibling to
// staff-subscription-alert.ts, and a separate template for the same reason
// that one is: this has no member, no price and no session date. It reports a
// CONFIGURATION state, and it asks for a decision rather than announcing an
// event.
//
// Unlike the other staff alerts this one repeats every night until the
// configuration changes, so it says so plainly — an unexplained recurring
// email gets filtered, and a filtered alert is the same as no alert.
import { emailLayout, detailRow, panel, esc } from "@/lib/emails/shell";
import type { BuiltEmail, StaffSlotAmbiguityAlertData } from "./types";

export function buildStaffSlotAmbiguityAlertEmail(
  data: StaffSlotAmbiguityAlertData
): BuiltEmail {
  const blocks = data.findings
    .map((finding) => {
      const rows = [
        detailRow("Plan", esc(finding.planName)),
        detailRow("Session", esc(finding.offeringTitle)),
        detailRow(
          "Now runs",
          finding.slots.map((slot) => esc(slot)).join("<br>")
        ),
        detailRow(
          "Subscribers affected",
          finding.activeSubscribers === 0
            ? "None yet — but the plan is on sale"
            : `${finding.activeSubscribers}`
        ),
      ].join("");
      return panel(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
      );
    })
    .join("");

  const plural = data.findings.length === 1 ? "A plan" : "Some plans";

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
${plural} now covers more than one weekly session. Anyone subscribed to it is
entitled to <strong>every</strong> session listed below, and their places are
being booked automatically each night.
</p>
${blocks}
<p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;">
Someone needs to decide whether the extra session is included in the existing
price or should be its own plan — it cannot be worked out automatically, and
changing it the wrong way would cancel current subscribers' places.
</p>
<p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#666;">
This email repeats each night until the plan is changed.
</p>
`;

  return {
    subject:
      data.findings.length === 1
        ? `Subscription plan covers more sessions than its name says — ${data.findings[0].planName}`
        : `${data.findings.length} subscription plans cover more sessions than their names say`,
    html: emailLayout(body, {
      preheader: "A subscription plan is entitling more sessions than expected",
      heading: "Subscription plan needs a decision",
    }),
  };
}
