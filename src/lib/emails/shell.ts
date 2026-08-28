// Presentation layer for every email this app sends — the branded, email
// client-safe shell and its primitives.
//
// Split out of lib/email.ts 2026-08-28. lib/email.ts owns *transport*
// (Resend) and carries `import "server-only"`, which made the shell
// impossible to render anywhere except inside a request. The Supabase auth
// email templates (signup confirmation, magic link, ...) live in Supabase
// config rather than in this codebase, so they have to be rendered by a
// script and pasted across — and rendering them meant either importing this
// shell or hand-writing a second copy of it.
//
// A second copy is the failure this project has already had three times over
// (PublicHeader / MemberHeader / AdminHeader), so the shell moved here
// instead: pure, no server-only, no Resend, runnable from plain node.
// lib/email.ts re-exports all of it, so existing `from "@/lib/email"`
// imports are unchanged.
import { links, membersUrl } from "@/lib/links";

/** Replies go to the general inbox, not the no-reply members address. */
export const EMAIL_REPLY_TO = links.contactEmail; // general@empowrcic.org

// Brand palette (mirrors globals.css) — inlined because email clients
// strip <style> and ignore CSS variables.
const BRAND = {
  blue: "#4a70c2",
  blueDark: "#3558a8",
  bluePale: "#eef3fc",
  ink: "#1b1b1b",
  mid: "#4a4a4a",
  muted: "#7a7a8a",
  line: "#e5e1db",
  cream: "#f8f7f4",
  white: "#ffffff",
} as const;

export { BRAND as EMAIL_BRAND };

/** HTML-escape a string for safe interpolation into email bodies. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap body HTML in the branded, email-client-safe shell. `preheader`
 *  is the hidden inbox-preview snippet. `bodyHtml` is trusted markup the
 *  caller has already escaped where needed. */
export function emailLayout(
  bodyHtml: string,
  opts: { preheader: string; heading: string }
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line};">
<!-- The logo sits in a WHITE chip on purpose: logo.png is a dark navy mark
     with a transparent background, so placing it directly on the blue header
     would leave it near-invisible. Absolute URL because email clients cannot
     resolve relative paths, and alt text carries the brand for the many
     clients that block remote images by default. Explicit width/height
     attributes (not just CSS) are what Outlook actually honours. -->
<tr><td style="background:${BRAND.blue};padding:18px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${BRAND.white};border-radius:10px;padding:6px;" width="52">
<img src="${membersUrl("/logo.png")}" width="40" height="40" alt="Empowr CIC" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;">
</td>
<td style="padding-left:12px;">
<span style="color:${BRAND.white};font-size:18px;font-weight:800;letter-spacing:-0.01em;">Empowr CIC</span>
</td>
</tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px 28px;">
<h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.25;font-weight:800;color:${BRAND.blueDark};">${esc(opts.heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 28px 28px 28px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
Empowr CIC · <a href="${links.mainSite}" style="color:${BRAND.blue};text-decoration:none;">empowrcic.org</a><br>
Questions? Reply to this email or contact <a href="mailto:${EMAIL_REPLY_TO}" style="color:${BRAND.blue};text-decoration:none;">${EMAIL_REPLY_TO}</a>.
</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A reusable labelled detail row for the summary cards. */
export function detailRow(label: string, value: string): string {
  return `<tr>
<td style="padding:6px 0;font-size:14px;color:${BRAND.muted};width:120px;vertical-align:top;">${esc(label)}</td>
<td style="padding:6px 0;font-size:14px;color:${BRAND.ink};font-weight:600;vertical-align:top;">${value}</td>
</tr>`;
}

/** A brand-blue CTA button (table-based for Outlook). */
export function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
<tr><td style="border-radius:999px;background:${BRAND.blue};">
<a href="${href}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:800;color:${BRAND.white};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr>
</table>`;
}

/** A soft blue panel wrapping summary content. */
export function panel(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bluePale};border-radius:12px;margin:4px 0 16px 0;">
<tr><td style="padding:16px 20px;">${innerHtml}</td></tr>
</table>`;
}
