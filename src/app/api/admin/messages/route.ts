import { NextResponse } from "next/server";
import { getMessageSender } from "@/lib/message-sender";
import { prepareAudience } from "@/lib/message-audience";
import { describeRecipients } from "@/lib/message-core";
import { sendSchema } from "@/lib/message-schema";
import { sendMessage } from "@/lib/message-send";
import { createSendDeps } from "@/lib/message-store";
import { createServiceClient } from "@/lib/supabase/service";

// Step two: send. The recipient list is NEVER taken from the request - it is resolved again here, behind
// the same role gate as the preview, and refused if it no longer matches what staff confirmed.
// Reachable by coaches as well as admins (the same pattern as /api/admin/bookings/[id]/checkin).
export async function POST(request: Request) {
  const sender = await getMessageSender();
  if (!sender) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (!sender.identity.ok) return NextResponse.json({ error: sender.identity.error }, { status: 409 });
  const identity = sender.identity;

  const parsed = sendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the message and try again." }, { status: 400 });
  }
  const v = parsed.data;

  const prepared = await prepareAudience(createServiceClient(), sender.role, v.audience);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  if (prepared.recipients.length === 0) {
    return NextResponse.json({ error: "Nobody is booked on that, so there is no one to message." }, { status: 422 });
  }
  if (prepared.recipients.length !== v.expected_count) {
    return NextResponse.json(
      {
        error: `Bookings changed while you were writing: it now reaches ${describeRecipients(prepared.recipients, v.audience.type)}. Check the preview and send again.`,
        count: prepared.recipients.length,
        recipients: prepared.recipients,
      },
      { status: 409 }
    );
  }

  try {
    const summary = await sendMessage(
      createSendDeps(),
      {
        id: crypto.randomUUID(),
        requestId: v.request_id,
        senderUserId: sender.user.id,
        senderRole: sender.role,
        senderName: identity.senderName,
        from: identity.from,
        signOff: identity.signOff,
        audience: v.audience,
        audienceLabel: prepared.label,
        subject: v.subject,
        body: v.body,
        urgent: v.urgent,
      },
      prepared.recipients
    );
    return NextResponse.json(summary, { status: summary.duplicate ? 200 : 201 });
  } catch (err) {
    console.error("send message failed", err);
    return NextResponse.json(
      { error: "The message could not be saved, so nothing was sent. Try again." },
      { status: 500 }
    );
  }
}
