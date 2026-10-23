// Account deletion emails (spec: planning/spec/account-deletion.md). Pure builders on the shell,
// like the other templates, so they render in a test and in the nightly function.
//
// The member's emails carry no data beyond what the member already has. The staff alert carries
// NO personal data at all — a reference and a link to the admin page — because it outlives the
// erasure in an inbox (owner 2026-10-22).
import { emailLayout, detailRow, panel, ctaButton, esc } from "@/lib/emails/shell";
import { formatPrice } from "@/lib/format";
import { membersUrl } from "@/lib/links";
import type { BuiltEmail } from "./types";

/** "Thursday 6 November 2026", in London time. */
export function deletionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London",
  });
}

const KEPT =
  "Some records are kept because the law or our safeguarding duty requires it, with your name and contact details removed: " +
  "booking and payment records for 7 years from each session; children's signed waivers and collection consents until the child turns 21, " +
  "or 3 years after their last session if that is later; adults' signed waivers for 3 years after their last session. " +
  "Full details are in our Privacy Policy.";

export function buildDeletionConfirmEmail(data: { confirmUrl: string }): BuiltEmail {
  const body = `
<p>We received a request to delete your Empowr Members account.</p>
<p>Nothing has happened yet. To go ahead, confirm with the button below. The link works for 24 hours.</p>
${ctaButton("Confirm account deletion", data.confirmUrl)}
<p>If you did not ask for this, ignore this email and your account stays as it is.</p>`;
  return {
    subject: "Confirm your account deletion request",
    html: emailLayout(body, { preheader: "Confirm that you want to delete your Empowr Members account.", heading: "Confirm account deletion" }),
  };
}

export type DeletionScheduledData = {
  eraseAfter: string;
  cancelUrl: string;
  held: boolean;
  bookings: { title: string; when: string; outcome: "refunded" | "kept" }[];
  membershipsCancelled: number;
  creditPence: number;
};

export function buildDeletionScheduledEmail(d: DeletionScheduledData): BuiltEmail {
  const rows = d.bookings
    .map((b) => detailRow(`${b.title} · ${b.when}`, b.outcome === "refunded" ? "Cancelled and refunded" : "Kept — inside 48 hours or non-refundable"))
    .join("");
  const what = [
    d.bookings.length ? panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`) : "",
    d.membershipsCancelled ? `<p>Your membership${d.membershipsCancelled > 1 ? "s have" : " has"} been cancelled. No further payments will be taken.</p>` : "",
    d.creditPence ? `<p>You have ${esc(formatPrice(d.creditPence))} of unused credit. It will be lost when your account is deleted.</p>` : "",
  ].join("");
  const when = d.held
    ? "<p>Your request is being reviewed by our team before your account is deleted. We'll be in touch if we need anything from you.</p>"
    : `<p>Your account is now locked and will be deleted on <strong>${esc(deletionDate(d.eraseAfter))}</strong>.</p>`;
  const body = `
<p>We've received your request to delete your Empowr Members account.</p>
${when}
${what}
<p>${esc(KEPT)}</p>
<p>Changed your mind? You can cancel any time before then.</p>
${ctaButton("Keep my account", d.cancelUrl)}`;
  return {
    subject: "Your account deletion request",
    html: emailLayout(body, { preheader: d.held ? "Your request is being reviewed." : `Your account will be deleted on ${deletionDate(d.eraseAfter)}.`, heading: "Account deletion requested" }),
  };
}

export function buildDeletionReminderEmail(d: { kind: "halfway" | "final"; eraseAfter: string; cancelUrl: string }): BuiltEmail {
  const date = deletionDate(d.eraseAfter);
  const lead = d.kind === "final"
    ? `<p>This is your last chance to keep your account. It will be deleted tomorrow, <strong>${esc(date)}</strong>.</p>`
    : `<p>A reminder that your Empowr Members account will be deleted on <strong>${esc(date)}</strong>, as you asked.</p>`;
  const body = `${lead}
<p>If you've changed your mind, you can keep your account with one click.</p>
${ctaButton("Keep my account", d.cancelUrl)}`;
  return {
    subject: d.kind === "final" ? "Your account will be deleted tomorrow" : "Your account deletion is coming up",
    html: emailLayout(body, { preheader: `Your account will be deleted on ${date}.`, heading: d.kind === "final" ? "Last chance to keep your account" : "Account deletion reminder" }),
  };
}

export function buildDeletionCompleteEmail(): BuiltEmail {
  const body = `
<p>Your Empowr Members account has now been deleted. You will not receive any more emails from Empowr Members.</p>
<p>${esc(KEPT)}</p>
<p>You're always welcome back. You can create a new account at any time.</p>
${ctaButton("Visit Empowr Members", membersUrl("/"))}`;
  return {
    subject: "Your account has been deleted",
    html: emailLayout(body, { preheader: "Your Empowr Members account has been deleted.", heading: "Account deleted" }),
  };
}

export function buildDeletionReactivatedEmail(d: { byStaff: boolean }): BuiltEmail {
  const body = `
<p>${d.byStaff ? "Our team has cancelled the deletion of your Empowr Members account" : "You've cancelled your account deletion"}, and your account is active again. You can sign in as normal.</p>
<p>Bookings and memberships cancelled when you made the request have not been restored. You can book again or re-subscribe at any time.</p>
${ctaButton("Sign in", membersUrl("/login"))}`;
  return {
    subject: "Your account is active again",
    html: emailLayout(body, { preheader: "Your Empowr Members account is active again.", heading: "Account reactivated" }),
  };
}

export type DeletionStaffEvent =
  | "requested" | "held" | "released" | "reversed" | "cancelled" | "erased" | "unhappy" | "failed";

const EVENT_TEXT: Record<DeletionStaffEvent, string> = {
  requested: "A member confirmed an account deletion request. It will run automatically after 14 days unless held.",
  held: "An account deletion is ON HOLD and will not run until a member of staff releases or reverses it.",
  released: "A held account deletion was released and will run at the next nightly job.",
  reversed: "Staff reversed an account deletion. The account is active again.",
  cancelled: "The member cancelled their account deletion. The account is active again.",
  erased: "An account was erased. Booking and payment records are kept, anonymised.",
  unhappy: "A member leaving gave the reason \"Not happy with sessions\". Someone may want to reach out before the deletion runs.",
  failed: "An account erasure did not complete and will be retried at the next nightly job. Check the function log.",
};

export function buildDeletionStaffAlertEmail(d: { event: DeletionStaffEvent; ref: string; holdReasons: string[]; adminUrl: string }): BuiltEmail {
  const body = `
<p>${esc(EVENT_TEXT[d.event])}</p>
${panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRow("Reference", esc(d.ref))}${
    d.holdReasons.length ? detailRow("Hold reasons", esc(d.holdReasons.join(", "))) : ""
  }</table>`)}
${ctaButton("Open in admin", d.adminUrl)}
<p>No personal details are included in this email. Look the account up from the admin page while it still exists.</p>`;
  return {
    subject: `Account deletion ${d.event} — ${d.ref}`,
    html: emailLayout(body, { preheader: EVENT_TEXT[d.event], heading: "Account deletion" }),
  };
}
