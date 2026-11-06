// Server-to-server only: the staff dashboard messages groups of families through the same pipeline as
// the admin Messages screen. It has its own secret because it reaches many families at once, and the
// dashboard decides which staff may use it. Sent as the shared admin identity (see staff-queue).
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { describeRecipients, SEGMENTS } from "@/lib/message-core";
import { prepareAudience } from "@/lib/message-audience";
import { listMessageOfferings, listMessageSessions, listSentMessages } from "@/lib/message-log";
import { audienceSchema, sendSchema } from "@/lib/message-schema";
import { sendMessage } from "@/lib/message-send";
import { messageSenderFor } from "@/lib/message-sender";
import { createSendDeps } from "@/lib/message-store";
import { logAction } from "@/lib/mcp/actions";
import { createServiceClient } from "@/lib/supabase/service";

const ROLE = "admin";
const CLIENT_ID = "empowr-dashboard";

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorised(request: NextRequest): boolean {
  const expected = process.env.STAFF_MESSAGES_SECRET;
  const given = request.headers.get("x-staff-messages-secret");
  return !!expected && !!given && timingSafeEqual(digest(given), digest(expected));
}

// One family at a time stays on the work list and the admin screen.
const groupAudience = audienceSchema.refine((a) => a.type !== "account", "Choose a group, course or session.");
const staffEmail = z.string().email();

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), audience: groupAudience }),
  sendSchema.extend({ action: z.literal("send"), audience: groupAudience, staff_email: staffEmail }),
]);

async function sharedSender() {
  const id = process.env.STAFF_QUEUE_SENDER_USER_ID;
  const { data, error } = id ? await createServiceClient().auth.admin.getUserById(id) : { data: { user: null }, error: null };
  if (error || !data.user) return null;
  return data.user;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [sessions, offerings, sent] = await Promise.all([listMessageSessions(ROLE), listMessageOfferings(), listSentMessages(20)]);
  return NextResponse.json({ sessions, offerings, segments: SEGMENTS, sent });
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const input = parsed.data;

  const prepared = await prepareAudience(createServiceClient(), ROLE, input.audience);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  const summary = describeRecipients(prepared.recipients, input.audience.type);

  if (input.action === "preview") {
    return NextResponse.json({ label: prepared.label, count: prepared.recipients.length, summary });
  }

  if (prepared.recipients.length === 0) return NextResponse.json({ error: "Nobody is in that audience." }, { status: 422 });
  if (prepared.recipients.length !== input.expected_count) {
    return NextResponse.json({ error: `Bookings changed: this now reaches ${summary}. Check the count and send again.` }, { status: 409 });
  }

  const user = await sharedSender();
  if (!user) return NextResponse.json({ error: "Sender is not set up" }, { status: 500 });
  const { identity } = await messageSenderFor(user, ROLE);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 500 });

  const caller = { user, role: ROLE, clientId: CLIENT_ID } as const;
  const logged = { staff_email: input.staff_email, audience: input.audience, subject: input.subject, request_id: input.request_id };
  try {
    const result = await sendMessage(
      createSendDeps(),
      {
        id: crypto.randomUUID(),
        requestId: input.request_id,
        senderUserId: user.id,
        senderRole: ROLE,
        senderName: identity.senderName,
        from: identity.from,
        signOff: identity.signOff,
        audience: input.audience,
        audienceLabel: prepared.label,
        subject: input.subject,
        body: input.body,
        urgent: input.urgent,
      },
      prepared.recipients
    );
    // The shared sender hides who pressed Send, so the staff member is recorded here.
    await logAction(caller, "dashboard_send_message", logged, result, true);
    return NextResponse.json(result);
  } catch (err) {
    await logAction(caller, "dashboard_send_message", logged, { error: String(err) }, false).catch(() => {});
    throw err;
  }
}
