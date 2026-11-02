// Admin Inbox actions on one contact message: reply (lib/contact-reply.ts, shared with the AI tools),
// or change its status. Admin only (getAuthedAdmin), not coaches: the Inbox holds contact details.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedAdmin } from "@/lib/admin";
import { getContactMessage, updateContactMessage } from "@/lib/contact-inbox";
import { ReplyError, replyToContact } from "@/lib/contact-reply";

const replySchema = z.object({
  action: z.literal("reply"),
  request_id: z.string().uuid(),
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(5000),
});
const statusSchema = z.object({ action: z.literal("status"), status: z.enum(["open", "closed"]) });
const bodySchema = z.discriminatedUnion("action", [replySchema, statusSchema]);

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

  try {
    await replyToContact(contact, admin, { requestId: parsed.data.request_id, subject: parsed.data.subject, body: parsed.data.body });
  } catch (err) {
    if (err instanceof ReplyError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
