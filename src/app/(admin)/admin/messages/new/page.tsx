import type { Metadata } from "next";
import Link from "next/link";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { listMessageOfferings, listMessageSessions } from "@/lib/message-log";

export const metadata: Metadata = { title: "New message — Members Admin" };
export const dynamic = "force-dynamic";

export default async function NewMessagePage() {
  const [sessions, offerings] = await Promise.all([listMessageSessions("admin"), listMessageOfferings()]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/admin/messages" className="text-sm font-bold text-mid underline underline-offset-2 hover:text-blue">
          Back to messages
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-black">New message</h1>
        <p className="mt-1 text-mid">
          For things families need to know about something they have booked, like a change of time. It is not for
          marketing: anything to all members goes through Brevo.
        </p>
      </div>
      <MessageComposer role="admin" sessions={sessions} offerings={offerings} logHref="/admin/messages" />
    </main>
  );
}
