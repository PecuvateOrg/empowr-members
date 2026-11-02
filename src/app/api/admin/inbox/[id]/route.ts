// Admin Inbox actions on one contact message: reply, or change its status.
//
// A reply to a message from a signed-in member goes through the normal message system to their
// account (Notifications, email to their login address, phone alert), so it sits beside every other
// message we send them. If they typed a different email address on the form, that address gets a
// copy too. A message from someone with no account is answered by email only.
//
// Admin only (getAuthedAdmin), not coaches: the Inbox holds contact details and free text.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { getMessageSender } from "@/lib/message-sender";
import { prepareAudience } from "@/lib/message-audience";
import { sendMessage } from "@/lib/message-send";
import { createSendDeps } from "@/lib/message-store";
import { createServiceClient } from "@/lib/supabase/service";
import { getContactMessage, updateContactMessage } from "@/lib/contact-inbox";
import { sendEmail } from "@/lib/email";
import { esc } from "@/lib/emails/shell";

const replySchema = z.object({
  action: z.literal("reply"),
  request_id: z.string().uuid(),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(5000),
});
const statusSchema = z.object({ action: z.literal("status"), status: z.enum(["open", "closed"]) });
const bodySchema = z.discriminatedUnion("action", [replySchema, statusSchema]);

function plainHtml(body: string): string {
  return body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthedAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the reply and try again." }, { status: 400 });
  }
  const contact = await getContactMessage(id);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "status") {
    await updateContactMessage(id, { status: parsed.data.status });
    return NextResponse.json({ ok: true });
  }

  const v = parsed.data;
  let replyMessageId: string | null = null;
  let loginEmailCovered = false;

  if (contact.account_id) {
    const sender = await getMessageSender();
    if (!sender?.identity.ok) return NextResponse.json({ error: "Your sender identity is not set up." }, { status: 409 });
    const audience = { type: "account" as const, id: contact.account_id };
    const prepared = await prepareAudience(createServiceClient(), "admin", audience);
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
    if (prepared.recipients.length > 0) {
      const messageId = crypto.randomUUID();
      const summary = await sendMessage(
        createSendDeps(),
        {
          id: messageId,
          requestId: v.request_id,
          senderUserId: sender.user.id,
          senderRole: "admin",
          senderName: sender.identity.senderName,
          from: sender.identity.from,
          signOff: sender.identity.signOff,
          audience,
          audienceLabel: prepared.label,
          subject: v.subject,
          body: v.body,
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
    const ok = await sendEmail({ to: contact.email, subject: v.subject, html: plainHtml(v.body) });
    if (!ok && !replyMessageId) {
      return NextResponse.json({ error: "The reply email could not be sent. Try again." }, { status: 502 });
    }
  }

  await updateContactMessage(id, {
    status: "replied",
    replied_at: new Date().toISOString(),
    replied_by: admin.id,
    reply_message_id: replyMessageId,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
