// Supabase auth email templates — signup confirmation, magic link, and the
// four that only an admin action can currently trigger.
//
// These are the emails Supabase sends directly over SMTP; they never pass
// through lib/email.ts. Supabase stores them as HTML strings in project auth
// config, so they cannot import anything at send time — they have to be
// rendered by ops/scripts/render-auth-templates.ts and applied to the
// project. Building them here, against the same shell as every other email,
// is what stops the auth emails drifting away from the transactional ones.
//
// The {{ .Xxx }} placeholders are Go template syntax evaluated by Supabase.
// They must reach the output RAW — never pass one through esc(), and never
// put one anywhere the shell would escape it.
//
// Link expiry wording is tied to the project's mailer_otp_exp, which is
// 600s since 2026-11-17 (codes replaced passwords; a code should not live an hour).
// If that value changes, EXPIRY_WORDING below has to change with it.
import { emailLayout, ctaButton, panel, EMAIL_BRAND } from "./shell";

/** Mirrors auth config mailer_otp_exp (600s). */
const EXPIRY_WORDING = "10 minutes";

const P = `margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};`;
/** The 6-digit code, big and easy to copy. Since 2026-11-17 the code is the main way in (typed into the page
 *  that asked for it, which keeps an installed iPhone app signed in); the link stays as a fallback. */
const CODE_BLOCK = `<p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.mid};">Your code:</p>
<p style="margin:0 0 24px 0;font-size:34px;line-height:1.2;font-weight:900;letter-spacing:8px;color:${EMAIL_BRAND.ink};">{{ .Token }}</p>`;
const SMALL = `margin:16px 0 0 0;font-size:13px;line-height:1.6;color:${EMAIL_BRAND.muted};`;

/** The raw URL under the button. Email clients mangle buttons often enough
 *  that an auth email without a copyable fallback can lock someone out of
 *  their own account. word-break keeps a long token from stretching the
 *  600px shell on mobile. */
function fallbackLink(url: string): string {
  return `<p style="${SMALL}">
Button not working? Copy and paste this link into your browser:<br>
<a href="${url}" style="color:${EMAIL_BRAND.blue};word-break:break-all;">${url}</a>
</p>`;
}

export type AuthTemplate = {
  /** Supabase auth config field stem, e.g. "confirmation". */
  key: string;
  subject: string;
  html: string;
};

// {{ .ConfirmationURL }} is NOT used, deliberately. Supabase defaults to the
// PKCE flow, so ConfirmationURL carries a `pkce_` token that can only be
// redeemed by the browser that STARTED the flow — it holds the code verifier
// and no other browser can produce it. Opening the link anywhere else returns
// "That sign-in link is invalid or has expired", which is untrue and tells the
// member nothing useful.
//
// That is not only a device-switch problem: a different browser on the SAME
// device fails too, so the common case is someone signing up in Safari and
// tapping the link in the Gmail app's in-app browser. On the signup
// confirmation — the first email any member receives — that locks them out
// with no way to self-diagnose.
//
// The fix is Supabase's own documented pattern for server-rendered apps: send
// {{ .TokenHash }} and let the app verify it with verifyOtp(), which is not
// bound to a browser. The email first opens /auth/confirm/start, which stages
// the token without consuming it; only the member's explicit POST verifies it.
//   https://supabase.com/docs/guides/auth/auth-email-passwordless
//
// The trade-off is real and accepted: a token-hash link works for anyone
// holding it, where a PKCE link does not. For email confirmation that is the
// standard position — possession of the inbox is the thing being proved.
//
// `type` values are the EmailOtpType union in the installed @supabase/auth-js
// ('signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'),
// read from node_modules rather than the docs, which are ambiguous on this.

/** For flows STARTED IN THIS APP. {{ .RedirectTo }} is whatever the form passed
 *  as emailRedirectTo, so it already ends in /auth/confirm/start?next=<path>:
 *  deep link survives (magic link from /login?next=/book/x lands on the booking
 *  page, not /account) and preview deploys still confirm against themselves,
 *  which a hardcoded {{ .SiteURL }} would break.
 *
 *  ⚠️ Appends with "&", so BOTH forms must send a query string in
 *  emailRedirectTo. SignupForm carries ?next=%2Faccount too, so every app flow
 *  obeys the same contract. */
function appFlowUrl(type: string): string {
  return `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${type}`;
}

/** For flows only reachable from the Supabase dashboard, where nothing in this
 *  app sets RedirectTo and it cannot be relied on to carry a query string. */
function dashboardFlowUrl(type: string): string {
  return `{{ .SiteURL }}/auth/confirm/start?token_hash={{ .TokenHash }}&type=${type}`;
}

// Magic link and signup confirmation use the RedirectTo form, because both
// have a destination to keep: /login?next=/book/x has to come back to the
// booking page, and signing up from a private birthday offer link
// (/signup?next=/private-bookings/offer/<token>) has to come back to the offer.
// LoginForm and SignupForm always send ?next=<path>, so the "&" append is safe;
// verify-auth-links.ts asserts both forms keep doing so.
//
// History: applying a RedirectTo signup template on 2026-08-30 broke signup
// confirmation, because it shipped before SignupForm sent a query string and the
// link came out as /auth/callback&token_hash=... with no "?". The form has sent
// ?next= since, so this is safe now — but the form contract must not regress.
const magicUrl = appFlowUrl("magiclink");
const confirmUrl = appFlowUrl("signup");

// Not reachable in-app today: recovery has no resetPasswordForEmail() caller,
// invite and email_change are dashboard-only. Nothing here sets RedirectTo for
// those, so they take the SiteURL form instead.
// Recovery lands on the set-a-new-password screen rather than /account.
// /auth/confirm/complete signs the member in on the way through, and safeNext()
// only ever accepts an in-app path, so this cannot be pointed off-site.
const recoveryUrl = `${dashboardFlowUrl("recovery")}&next=/account`;
const inviteUrl = dashboardFlowUrl("invite");
const emailChangeUrl = dashboardFlowUrl("email_change");

/** Signup confirmation — the first email any member ever receives. */
export function confirmationTemplate(): AuthTemplate {
  const body = `
<p style="${P}">
Welcome to Empowr CIC. Confirm your email address to finish setting up your account — then you can book sessions, add the people in your household, and pull up your tickets at the door.
</p>
${CODE_BLOCK}
<p style="${P}">
Enter it on the page where you created your account. Can't use the code? Tap the button instead.
</p>
${ctaButton("Confirm email address", confirmUrl)}
${fallbackLink(confirmUrl)}
<p style="${SMALL}">
This code expires in ${EXPIRY_WORDING}. If you did not create an Empowr Members account, you can safely ignore this email.
</p>`;
  return {
    key: "confirmation",
    subject: "Your Empowr code: {{ .Token }}",
    html: emailLayout(body, {
      preheader:
        "Your code to finish setting up your Empowr Members account: {{ .Token }}",
      heading: "Confirm your email address",
    }),
  };
}

/** Sign-in code (Supabase's "magic link" email). Sent by /login, and by /signup for an existing account. */
export function magicLinkTemplate(): AuthTemplate {
  const body = `
<p style="${P}">
Enter this code on the page where you asked to sign in to Empowr Members.
</p>
${CODE_BLOCK}
<p style="${P}">
Can't use the code? Tap the button instead.
</p>
${ctaButton("Sign in", magicUrl)}
${fallbackLink(magicUrl)}
<p style="${SMALL}">
This code expires in ${EXPIRY_WORDING} and can only be used once. If you did not ask to sign in, you can ignore this email: no one can get in without it.
</p>`;
  return {
    key: "magic_link",
    subject: "Your Empowr sign-in code: {{ .Token }}",
    html: emailLayout(body, {
      preheader: "Your sign-in code for Empowr Members: {{ .Token }}",
      heading: "Your sign-in code",
    }),
  };
}

/** Account recovery. There are no passwords since 2026-11-17 and nothing in the app sends this any more;
 *  only a Supabase dashboard "send recovery" can. It simply signs the member in. */
export function recoveryTemplate(): AuthTemplate {
  const body = `
<p style="${P}">
Use the link below to sign in to your Empowr Members account.
</p>
${ctaButton("Sign in", recoveryUrl)}
${fallbackLink(recoveryUrl)}
<p style="${SMALL}">
This link expires in ${EXPIRY_WORDING} and can only be used once. If you did not ask for this, you can ignore this email. Need help getting into your account? Just reply and we will sort it out.
</p>`;
  return {
    key: "recovery",
    subject: "Your sign-in link",
    html: emailLayout(body, {
      preheader: "A single-use link to sign in to your account.",
      heading: "Sign in to your account",
    }),
  };
}

/** Email change. secure_email_change is ON, so this goes to BOTH the old and
 *  the new address and each must confirm — the copy has to read correctly to
 *  either recipient, which is why it does not say "your new address". */
export function emailChangeTemplate(): AuthTemplate {
  const body = `
<p style="${P}">
We were asked to change the email address on your Empowr Members account to <strong style="color:${EMAIL_BRAND.ink};">{{ .NewEmail }}</strong>.
</p>
${ctaButton("Confirm this change", emailChangeUrl)}
${fallbackLink(emailChangeUrl)}
<p style="${SMALL}">
For your security both the old and the new address have to confirm before the change takes effect, so you may get this email twice. If you did not request this change, ignore this email and the address on your account stays as it is.
</p>`;
  return {
    key: "email_change",
    subject: "Confirm your new email address",
    html: emailLayout(body, {
      preheader:
        "Confirm the email address change on your Empowr Members account.",
      heading: "Confirm your email change",
    }),
  };
}

/** Invite. No in-app invite flow exists — this only fires if someone invites
 *  a user from the Supabase dashboard. Branded so it is not a bare page if
 *  that ever happens. */
export function inviteTemplate(): AuthTemplate {
  const body = `
<p style="${P}">
You have been invited to create an Empowr Members account. That is where you book Empowr CIC sessions, manage the people in your household, and get your tickets.
</p>
${ctaButton("Accept invitation", inviteUrl)}
${fallbackLink(inviteUrl)}
<p style="${SMALL}">
If you were not expecting this invitation, you can safely ignore this email.
</p>`;
  return {
    key: "invite",
    subject: "You have been invited to Empowr Members",
    html: emailLayout(body, {
      preheader: "You have been invited to create an Empowr Members account.",
      heading: "You have been invited",
    }),
  };
}

/** Reauthentication — a 6-digit code, no link. Currently unreachable
 *  (security_update_password_require_reauthentication is false). */
export function reauthenticationTemplate(): AuthTemplate {
  const code = `<div style="font-size:30px;font-weight:800;letter-spacing:0.22em;color:${EMAIL_BRAND.blueDark};text-align:center;font-family:Consolas,Menlo,monospace;">{{ .Token }}</div>`;
  const body = `
<p style="${P}">
Enter this code to confirm it is really you.
</p>
${panel(code)}
<p style="${SMALL}">
The code expires in ${EXPIRY_WORDING}. If you did not request it, you can safely ignore this email — and please reply to let us know.
</p>`;
  return {
    key: "reauthentication",
    subject: "Your Empowr Members verification code",
    html: emailLayout(body, {
      preheader: "Your verification code for Empowr Members.",
      heading: "Your verification code",
    }),
  };
}

/** Every template, in the order they are applied. */
export function allAuthTemplates(): AuthTemplate[] {
  return [
    confirmationTemplate(),
    magicLinkTemplate(),
    recoveryTemplate(),
    emailChangeTemplate(),
    inviteTemplate(),
    reauthenticationTemplate(),
  ];
}
