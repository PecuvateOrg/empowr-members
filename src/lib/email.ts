// Transactional email transport — Resend. members@empowrcic.org is the
// verified sender (the same address Supabase auth SMTP already sends from).
// sendEmail() NEVER throws: an email failure must not fail the caller —
// the Stripe webhook in particular must still return 2xx so Stripe does
// not retry a payment that already confirmed. Failures are logged loudly.
//
// The branded shell and its primitives moved to lib/emails/shell.ts
// 2026-08-28 and are re-exported below, so every existing
// `from "@/lib/email"` import is unchanged. The split exists because this
// module carries `import "server-only"` and pulls in Resend, which made the
// shell unrenderable outside a request — and the Supabase auth email
// templates have to be rendered by a script. See shell.ts for the full why.
import "server-only";
import { Resend } from "resend";
import { EMAIL_REPLY_TO } from "@/lib/emails/shell";

export {
  EMAIL_BRAND,
  EMAIL_REPLY_TO,
  esc,
  emailLayout,
  detailRow,
  ctaButton,
  panel,
} from "@/lib/emails/shell";

/** Display sender. Resend-verified domain empowrcic.org. */
export const EMAIL_FROM = "Empowr CIC <members@empowrcic.org>";

let client: Resend | null = null;

function getResend(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(key);
  }
  return client;
}

/** Send one email. Returns true on success, false on any failure — never
 *  throws. Callers that must not fail (webhook) can ignore the result;
 *  callers that want to surface a problem to the member can branch on it. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  try {
    const { error } = await getResend().emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error("Resend send error", params.to, params.subject, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send threw", params.to, params.subject, err);
    return false;
  }
}
