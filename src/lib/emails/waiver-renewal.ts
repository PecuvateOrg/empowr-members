// Waiver renewal reminder — sent 14 days before a household's waiver lapses
// (owner request 2026-10-04). A waiver is valid for a year; subscribers never
// see a booking page, so without this their first sign of a lapsed waiver is
// being refused at the door. One email per household, naming everyone due.
//
// Built on lib/emails/shell.ts so the nightly Netlify function can render it
// (lib/email.ts carries `import "server-only"`).
import { emailLayout, detailRow, panel, ctaButton, esc } from "@/lib/emails/shell";
import { membersUrl } from "@/lib/links";
import type { BuiltEmail } from "./types";

export type WaiverRenewalData = {
  accountName: string;
  /** Everyone in the household whose waiver lapses soon. */
  people: { name: string; renewBy: string }[];
};

export function buildWaiverRenewalEmail(data: WaiverRenewalData): BuiltEmail {
  const rows = data.people
    .map((p) => detailRow(esc(p.name), `Renew by ${esc(p.renewBy)}`))
    .join("");
  const one = data.people.length === 1;
  const greeting = data.accountName.trim()
    ? `Hi ${esc(data.accountName.trim().split(/\s+/)[0])},`
    : "Hi,";

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">${greeting}</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
Waivers last a year, and ${one ? "this one is" : "these are"} nearly due for
renewal. It takes a couple of minutes, and once it's done nothing changes for
your bookings or membership.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
<p style="margin:16px 0;font-size:15px;line-height:1.6;">
${one ? "After that date they" : "After their renewal date, anyone not renewed"}
can't be booked or checked in until the waiver is signed again.
</p>
${ctaButton("Renew the waiver", membersUrl("/waiver"))}
`;

  return {
    subject: one
      ? `Time to renew ${data.people[0].name}'s waiver`
      : "Time to renew your household's waivers",
    html: emailLayout(body, {
      preheader: `Renew by ${data.people[0].renewBy} to keep booking.`,
      heading: "Your waiver is due for renewal",
    }),
  };
}
