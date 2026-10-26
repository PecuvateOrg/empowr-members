import { NextResponse } from "next/server";
import { getMessageSender } from "@/lib/message-sender";
import { prepareAudience } from "@/lib/message-audience";
import { describeRecipients } from "@/lib/message-core";
import { previewSchema } from "@/lib/message-schema";
import { createServiceClient } from "@/lib/supabase/service";

// Step one of two: tell staff exactly who a message would reach. Nothing is written or sent here.
// Reachable by coaches as well as admins, so the audience rules are enforced inside
// prepareAudience(), not by the path.
export async function POST(request: Request) {
  const sender = await getMessageSender();
  if (!sender) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose who to message." }, { status: 400 });

  const prepared = await prepareAudience(createServiceClient(), sender.role, parsed.data.audience);
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });

  return NextResponse.json({
    sendingAs: sender.identity.ok ? sender.identity.senderName : null,
    senderError: sender.identity.ok ? null : sender.identity.error,
    label: prepared.label,
    count: prepared.recipients.length,
    summary: describeRecipients(prepared.recipients, parsed.data.audience.type),
    recipients: prepared.recipients,
  });
}
