// Transactional email transport — the group's shared SES layer
// (lib/emails/send-email.ts, a byte-for-byte copy of the canonical file; never edit it here).
// members@empowrcic.org is the sender (the same address Supabase auth SMTP sends from).
// sendEmail() NEVER throws: an email failure must not fail the caller —
// the Stripe webhook in particular must still return 2xx so Stripe does
// not retry a payment that already confirmed. Failures are logged loudly.
//
// The branded shell and its primitives moved to lib/emails/shell.ts
// 2026-08-28 and are re-exported below, so every existing
// `from "@/lib/email"` import is unchanged. The split exists because this
// module carries `import "server-only"` and pulls in the email transport, which made the
// shell unrenderable outside a request — and the Supabase auth email
// templates have to be rendered by a script. See shell.ts for the full why.
import "server-only";
import { sendEmail as send, sendEmailBatch as sendBatch } from "@/lib/emails/send-email";
import { EMAIL_REPLY_TO, EMAIL_FROM } from "@/lib/emails/shell";

export {
  EMAIL_BRAND,
  EMAIL_REPLY_TO,
  // Sender identity moved to shell.ts 2026-09-07 so the nightly Netlify
  // function can reuse it — it cannot import this module, which is guarded.
  // Re-exported here so every `from "@/lib/email"` import is unchanged.
  EMAIL_FROM,
  esc,
  emailLayout,
  detailRow,
  ctaButton,
  panel,
} from "@/lib/emails/shell";

/** Send one email. Returns true on success, false on any failure — never
 *  throws. Callers that must not fail (webhook) can ignore the result;
 *  callers that want to surface a problem to the member can branch on it. */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const { error } = await send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    console.error("email send error", params.to, params.subject, error);
    return false;
  }
  return true;
}

export type BatchEmail = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type BatchOutcome = { id: string } | { error: string };

/** Send a batch of emails. One outcome per input, in input order - never throws and never collapses a
 *  failure into success, because the caller records each result against its recipient. One bad address
 *  fails only its own row.
 *  `idempotencyKey` is honoured only while EMAIL_PROVIDER=resend (per item: `<key>-<index>`). SES has no
 *  idempotency; a double send is prevented upstream by the message's unique requestId. */
export async function sendEmailBatch(
  items: BatchEmail[],
  idempotencyKey: string
): Promise<BatchOutcome[]> {
  if (items.length === 0) return [];
  // 12/s stays under the SES account rate (14/s; raise requested 2026-11-26). Revisit with the quota.
  const results = await sendBatch(
    items.map((item, i) => ({ ...item, idempotencyKey: `${idempotencyKey}-${i}` })),
    { perSecond: 12 }
  );
  return results.map((r) => {
    if (r.data?.id) return { id: r.data.id };
    if (r.error) console.error("email batch item error", idempotencyKey, r.error);
    return { error: r.error?.message ?? "Email service did not return an id" };
  });
}
