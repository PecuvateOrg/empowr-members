// Server-to-server only: the staff dashboard lists open contact messages and answers them from its
// work list. Replies go through replyToContact, so they behave like a reply from the admin Inbox,
// sent as the shared admin identity (STAFF_QUEUE_SENDER_USER_ID must be on ADMIN_EMAILS).
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getContactMessage, listContactMessages, updateContactMessage } from "@/lib/contact-inbox";
import { ReplyError, replyToContact } from "@/lib/contact-reply";
import { createServiceClient } from "@/lib/supabase/service";

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorised(request: NextRequest): boolean {
  const expected = process.env.STAFF_QUEUE_SECRET;
  const given = request.headers.get("x-staff-queue-secret");
  return !!expected && !!given && timingSafeEqual(digest(given), digest(expected));
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messages = await listContactMessages(200);
  return NextResponse.json({ messages: messages.filter((m) => m.status === "open") });
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, action, requestId, body } = await request.json().catch(() => ({}));
  const contact = typeof id === "string" ? await getContactMessage(id) : null;
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "close") {
    await updateContactMessage(contact.id, { status: "closed" });
    return NextResponse.json({ success: true });
  }
  if (action !== "reply" || typeof body !== "string" || !body.trim() || typeof requestId !== "string") {
    return NextResponse.json({ error: "action reply with body and requestId, or close" }, { status: 400 });
  }

  const senderId = process.env.STAFF_QUEUE_SENDER_USER_ID;
  const { data, error } = senderId
    ? await createServiceClient().auth.admin.getUserById(senderId)
    : { data: { user: null }, error: null };
  if (error || !data.user) return NextResponse.json({ error: "Sender is not set up" }, { status: 500 });

  try {
    const result = await replyToContact(contact, data.user, { requestId, subject: `Re: ${contact.topic}`, body });
    return NextResponse.json({ success: true, to: contact.name, via: result.via });
  } catch (err) {
    if (err instanceof ReplyError) return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
