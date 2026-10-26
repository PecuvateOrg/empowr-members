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

export type BatchEmail = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type BatchOutcome = { id: string } | { error: string };

/** Send up to 100 emails in one Resend batch call. One outcome per input, in input order - never throws
 *  and never collapses a failure into success, because the caller records each result against its
 *  recipient. `permissive` validation lets Resend send the valid emails and name the invalid ones by
 *  index, so one bad address cannot sink the whole batch.
 *  `idempotencyKey` makes a retried call return the original result instead of sending twice. */
export async function sendEmailBatch(
  items: BatchEmail[],
  idempotencyKey: string
): Promise<BatchOutcome[]> {
  const failAll = (error: string): BatchOutcome[] => items.map(() => ({ error }));
  if (items.length === 0) return [];
  try {
    const { data, error } = await getResend().batch.send(items, {
      idempotencyKey,
      batchValidation: "permissive",
    });
    if (error || !data) {
      console.error("Resend batch error", idempotencyKey, error);
      return failAll(error?.message ?? "Email service returned no result");
    }
    const failed = new Map((data.errors ?? []).map((e) => [e.index, e.message]));
    const ids = data.data.map((d) => d.id);
    let next = 0;
    return items.map((_, index) => {
      const message = failed.get(index);
      if (message !== undefined) return { error: message };
      const id = ids[next++];
      return id ? { id } : { error: "Email service did not return an id" };
    });
  } catch (err) {
    console.error("Resend batch threw", idempotencyKey, err);
    return failAll(err instanceof Error ? err.message : "Email service error");
  }
}
