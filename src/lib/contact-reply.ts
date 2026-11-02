// Replying to an admin Inbox message - shared by the Inbox screen (/api/admin/inbox/[id]) and the
// AI tools (lib/mcp/tools.ts), so the two cannot drift.
//
// A message from a signed-in member is answered through the normal message system to their account
// (Notifications, email to their login address, phone alert). If they typed a different address on
// the form, that address gets a copy too. Someone with no account is answered by email only.
import "server-only";
import type { User } from "@supabase/supabase-js";
import { messageSenderFor } from "@/lib/message-sender";
import { prepareAudience } from "@/lib/message-audience";
import { sendMessage } from "@/lib/message-send";
import { createSendDeps } from "@/lib/message-store";
import { createServiceClient } from "@/lib/supabase/service";
import { updateContactMessage, type ContactMessage } from "@/lib/contact-inbox";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/emails/shell";

export class ReplyError extends Error {}

function plainHtml(body: string): string {
  return body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Sends the reply and marks the message replied. `requestId` makes a retried send a duplicate. */
export async function replyToContact(
  contact: ContactMessage,
  admin: User,
  reply: { requestId: string; subject: string; body: string }
): Promise<{ via: "account" | "email"; replyMessageId: string | null }> {
  let replyMessageId: string | null = null;
  let loginEmailCovered = false;

  if (contact.account_id) {
    const sender = await messageSenderFor(admin, "admin");
    if (!sender.identity.ok) throw new ReplyError("Your sender identity is not set up.");
    const audience = { type: "account" as const, id: contact.account_id };
    const prepared = await prepareAudience(createServiceClient(), "admin", audience);
    if (!prepared.ok) throw new ReplyError(prepared.error);
    if (prepared.recipients.length > 0) {
      const messageId = crypto.randomUUID();
      const summary = await sendMessage(
        createSendDeps(),
        {
          id: messageId,
          requestId: reply.requestId,
          senderUserId: admin.id,
          senderRole: "admin",
          senderName: sender.identity.senderName,
          from: sender.identity.from,
          signOff: sender.identity.signOff,
          audience,
          audienceLabel: prepared.label,
          subject: reply.subject,
          body: reply.body,
          urgent: false,
        },
        prepared.recipients
      );
      replyMessageId = summary.duplicate ? null : messageId;
      // The login address was emailed by sendMessage; only a different typed address needs a copy.
      // A failed lookup leaves loginEmailCovered false, so the typed address gets a copy: a
      // duplicate email is the safe side of not knowing.
      const { data, error } = await createServiceClient()
        .from("mem_accounts")
        .select("user_id")
        .eq("id", contact.account_id)
        .maybeSingle();
      if (error) console.error("reply login lookup failed", contact.account_id, error);
      if (data?.user_id) {
        const { data: user, error: userError } = await createServiceClient().auth.admin.getUserById(data.user_id as string);
        if (userError) console.error("reply login lookup failed", contact.account_id, userError);
        loginEmailCovered = user?.user?.email?.toLowerCase() === contact.email.toLowerCase();
      }
    }
  }

  if (!loginEmailCovered) {
    const ok = await sendEmail({ to: contact.email, subject: reply.subject, html: plainHtml(reply.body) });
    if (!ok && !replyMessageId) throw new ReplyError("The reply email could not be sent. Try again.");
  }

  await updateContactMessage(contact.id, {
    status: "replied",
    replied_at: new Date().toISOString(),
    replied_by: admin.id,
    reply_message_id: replyMessageId,
  });
  return { via: replyMessageId ? "account" : "email", replyMessageId };
}
