import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { FormNotice } from "@/components/ui/form";
import { getMessageSender } from "@/lib/message-sender";
import { listMessageSessions } from "@/lib/message-log";
import { COACH_WINDOW_DAYS } from "@/lib/message-core";

export const metadata: Metadata = { title: "Message families — Door Check-in" };
export const dynamic = "force-dynamic";

/** The coach/door-team send screen. Coaches can message the families booked on ONE session, from today to
 *  7 days ahead. The checkin layout has already enforced CHECKIN_EMAILS. */
export default async function CheckinMessagesPage() {
  const sender = await getMessageSender();
  if (!sender) redirect("/login?next=/checkin/messages");
  // An administrator has the full composer (offerings, one member) in the admin console.
  if (sender.role === "admin") redirect("/admin/messages/new");
  const sessions = await listMessageSessions("coach");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/checkin" className="text-sm font-bold text-mid underline underline-offset-2 hover:text-blue">
          Back to check in
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-black">Message families</h1>
        <p className="mt-1 text-mid">
          Tell every family booked on a session something they need to know, like running late or what to bring.
          Sessions from today to {COACH_WINDOW_DAYS} days ahead.
        </p>
      </div>
      {!sender.identity.ok && <FormNotice tone="error">{sender.identity.error}</FormNotice>}
      <MessageComposer role="coach" sessions={sessions} />
    </main>
  );
}
