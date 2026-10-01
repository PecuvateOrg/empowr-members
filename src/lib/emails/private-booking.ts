// Private booking emails: the host's confirmation and the staff alert.
//
// The host email carries the birthday invite link, which is a capability to
// register guests onto the booking. It therefore goes only to the host and is
// never included in the staff alert.
import { emailLayout, detailRow, panel, ctaButton, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import { COACHING_SAFETY, PRIVATE_TERMS } from "@/lib/private-bookings";
import type { BuiltEmail } from "./types";

export type PrivateBookingEmailData = {
  hostName: string;
  kindLabel: string;
  when: string;
  venue: string | null;
  isBirthday: boolean;
  paidPlaces: number;
  totalPlaces: number;
  /** Coaching: the skaters and their equipment. Empty for birthdays. */
  skaters: { name: string; equipment: string }[];
  amountPence: number;
  /** false for a manual booking recorded as owed or complimentary. */
  paidOnline: boolean;
  manageUrl: string;
  inviteUrl: string | null;
  equipmentDeadline: string | null;
};

export function buildPrivateBookingConfirmationEmail(
  data: PrivateBookingEmailData
): BuiltEmail {
  const rows = [
    detailRow("Booking", esc(data.kindLabel)),
    detailRow("When", esc(data.when)),
    ...(data.venue ? [detailRow("Where", esc(data.venue))] : []),
    detailRow(
      "Places",
      data.isBirthday
        ? esc(`${data.totalPlaces} (${data.paidPlaces} paid + 1 free for the birthday person)`)
        : esc(String(data.totalPlaces))
    ),
    ...(data.skaters.length > 0
      ? [
          detailRow(
            "Skaters",
            data.skaters.map((s) => `${esc(s.name)} — ${esc(s.equipment)}`).join("<br>")
          ),
        ]
      : []),
    ...(data.paidOnline ? [detailRow("Paid", esc(formatPrice(data.amountPence)))] : []),
  ].join("");

  const birthday = data.isBirthday && data.inviteUrl
    ? `
<p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;font-weight:700;">Invite your guests</p>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">
Share this link with each skater’s parent or guardian. Each one signs in or
registers, adds their child, completes the waiver and chooses skate hire or
their own skates. The birthday person uses it too. Their place is covered by
your booking — they pay nothing.
</p>
${ctaButton("Guest registration link", data.inviteUrl)}
<p style="margin:12px 0 16px 0;font-size:14px;line-height:1.6;word-break:break-all;color:#555;">${esc(data.inviteUrl)}</p>
${
  data.equipmentDeadline
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
<strong>Skate sizes are needed by ${esc(data.equipmentDeadline)}</strong> — two weeks
before the party — so everything is ready on the day. You can see who has
registered, and who still needs to, from your booking page.
</p>`
    : ""
}`
    : "";

  const safety = !data.isBirthday
    ? COACHING_SAFETY.map(
        (line) => `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;">${esc(line)}</p>`
      ).join("")
    : "";

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
Hi ${esc(data.hostName || "there")}, your private booking is confirmed.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
${birthday}
${safety}
${ctaButton("View your booking", data.manageUrl)}
<p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#666;">${esc(PRIVATE_TERMS)}</p>
`;

  return {
    subject: `Your private booking is confirmed — ${data.kindLabel}, ${data.when}`,
    html: emailLayout(body, {
      preheader: `${data.kindLabel} · ${data.when}`,
      heading: "Private booking confirmed",
    }),
  };
}

export type StaffPrivateBookingAlertData = {
  kindLabel: string;
  when: string;
  places: string;
  amountPence: number;
  hostName: string;
  hostEmail: string;
  adminUrl: string;
};

export function buildStaffPrivateBookingAlertEmail(
  data: StaffPrivateBookingAlertData
): BuiltEmail {
  const rows = [
    detailRow("Booking", esc(data.kindLabel)),
    detailRow("When", esc(data.when)),
    detailRow("Places", esc(data.places)),
    detailRow("Paid", esc(formatPrice(data.amountPence))),
    detailRow("Booked by", `${esc(data.hostName)} &lt;${esc(data.hostEmail)}&gt;`),
  ].join("");

  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
A new private booking just came in. The time is now reserved.
</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
${ctaButton("Open in admin", data.adminUrl)}
`;

  return {
    subject: `New private booking — ${data.kindLabel}, ${data.when}`,
    html: emailLayout(body, {
      preheader: `${data.kindLabel} · ${data.when} · ${data.hostName}`,
      heading: "New private booking",
    }),
  };
}

// ---------------------------------------------------------------------------
// Skaters added after booking
// ---------------------------------------------------------------------------

export type PrivateTopupEmailData = {
  hostName: string;
  kindLabel: string;
  when: string;
  addedPlaces: number;
  totalPlaces: number;
  amountPence: number;
  isBirthday: boolean;
  manageUrl: string;
};

export function buildPrivateTopupEmail(data: PrivateTopupEmailData): BuiltEmail {
  const rows = [
    detailRow("Booking", esc(data.kindLabel)),
    detailRow("When", esc(data.when)),
    detailRow("Added", esc(`${data.addedPlaces} ${data.addedPlaces === 1 ? "skater" : "skaters"}`)),
    detailRow("Places now", esc(String(data.totalPlaces))),
    detailRow("Paid", esc(formatPrice(data.amountPence))),
  ].join("");
  const next = data.isBirthday
    ? "The extra places are open on your invite link now. Each guest registers there and completes a waiver before they skate."
    : "The extra skaters are on your booking now.";
  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Hi ${esc(data.hostName)}, thanks — your extra skaters are booked.</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
<p style="margin:16px 0;font-size:15px;line-height:1.6;">${esc(next)}</p>
${ctaButton("View your booking", data.manageUrl)}
<p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:#555;">${esc(PRIVATE_TERMS)}</p>
`;
  return {
    subject: `Extra skaters added — ${data.kindLabel}, ${data.when}`,
    html: emailLayout(body, { preheader: `${data.addedPlaces} more · ${data.when}`, heading: "Skaters added" }),
  };
}

export function buildStaffPrivateTopupAlertEmail(data: {
  kindLabel: string;
  when: string;
  addedPlaces: number;
  totalPlaces: number;
  amountPence: number;
  hostName: string;
  hostEmail: string;
  adminUrl: string;
}): BuiltEmail {
  const rows = [
    detailRow("Booking", esc(data.kindLabel)),
    detailRow("When", esc(data.when)),
    detailRow("Added", esc(String(data.addedPlaces))),
    detailRow("Places now", esc(String(data.totalPlaces))),
    detailRow("Paid", esc(formatPrice(data.amountPence))),
    detailRow("Host", `${esc(data.hostName)} &lt;${esc(data.hostEmail)}&gt;`),
  ].join("");
  const body = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Skaters were added to a private booking. Plan staff and equipment for the new total.</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`)}
${ctaButton("Open in admin", data.adminUrl)}
`;
  return {
    subject: `Skaters added — ${data.kindLabel}, ${data.when} (now ${data.totalPlaces})`,
    html: emailLayout(body, { preheader: `+${data.addedPlaces} · ${data.when}`, heading: "Skaters added" }),
  };
}
