// A staff message to a family (member messaging, spec 2026-10-26). The subject and body are exactly what
// staff wrote; the fixed footer names the session and date and links to the message in the account.
// Pure: no transport, so the verify suite can render it.
import { emailLayout, panel, detailRow, ctaButton, esc, EMAIL_BRAND } from "@/lib/emails/shell";
import { displaySubject } from "@/lib/message-core";
import type { BuiltEmail } from "./types";

export type MemberMessageEmailData = {
  subject: string;
  body: string;
  urgent: boolean;
  /** "Sam, Empowr CIC" for a coach; null for the team. */
  signOff: string | null;
  /** "Roller Quad Camp - Mon 26 Oct 2026, 10:30am-3pm"; empty for a one-member message. */
  audienceLabel: string;
  participantNames: string[];
  messageUrl: string;
};

function paragraphs(body: string): string {
  return body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.ink};">${esc(p.trim()).replace(/\r?\n/g, "<br>")}</p>`
    )
    .join("\n");
}

export function buildMemberMessageEmail(data: MemberMessageEmailData): BuiltEmail & { text: string } {
  const subject = displaySubject(data.subject, data.urgent);
  const rows = [
    data.audienceLabel ? detailRow("About", esc(data.audienceLabel)) : "",
    data.participantNames.length > 0 ? detailRow("For", esc(data.participantNames.join(", "))) : "",
  ].join("");
  const signOff = data.signOff
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.ink};">${esc(data.signOff)}</p>`
    : "";
  const html = emailLayout(
    `${paragraphs(data.body)}
${signOff}
${rows ? panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`) : ""}
${ctaButton("View in your account", data.messageUrl)}
<p style="margin:12px 0 0 0;font-size:13px;line-height:1.6;color:${EMAIL_BRAND.muted};">
You are getting this because you have a booking with Empowr CIC. It is a message about that booking, not marketing.
</p>`,
    { preheader: data.body.trim().split(/\r?\n/)[0] ?? subject, heading: subject }
  );
  const text = [
    data.body.trim(),
    data.signOff,
    data.audienceLabel && `About: ${data.audienceLabel}`,
    data.participantNames.length > 0 && `For: ${data.participantNames.join(", ")}`,
    `View in your account: ${data.messageUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject, html, text };
}
