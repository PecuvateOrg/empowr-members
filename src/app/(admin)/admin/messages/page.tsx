import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { listSentMessages } from "@/lib/message-log";
import { TIMEZONE } from "@/lib/business-rules";

export const metadata: Metadata = { title: "Messages — Members Admin" };
export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  const messages = await listSentMessages(50);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-black">Messages</h1>
          <p className="mt-1 text-mid">
            Messages sent to families by email, in their account and as phone alerts. Coaches send from the door view;
            everything they send appears here too.
          </p>
        </div>
        <Link
          href="/admin/messages/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue px-6 font-extrabold text-white shadow-blue hover:bg-blue-dark"
        >
          <Send className="h-4 w-4" aria-hidden /> New message
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="font-extrabold text-black">No messages sent yet</p>
          <p className="mt-1 text-sm text-mid">Pick a session, write a message and every family booked on it is told.</p>
          <Link href="/admin/messages/new" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-blue px-6 font-extrabold text-white hover:bg-blue-dark">
            Write the first one
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {messages.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/messages/${m.id}`} className="block px-5 py-4 transition-colors hover:bg-blue-pale/40">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-extrabold text-black">
                    {m.urgent && <span className="mr-2 rounded bg-red-soft px-2 py-0.5 text-xs font-black text-red-dark">URGENT</span>}
                    {m.subject}
                  </p>
                  <p className="text-xs font-semibold text-mid">
                    {formatInTimeZone(m.createdAt, TIMEZONE, "EEE d MMM yyyy, h:mmaaa")}
                  </p>
                </div>
                <p className="mt-1 text-sm text-mid">
                  {m.senderName}
                  {m.senderRole === "coach" ? " (coach)" : ""} to {m.audienceLabel || "one member"}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-black">
                  <span>{m.recipients} {m.recipients === 1 ? "recipient" : "recipients"}</span>
                  <span>Email sent {m.emailSent}</span>
                  {m.emailFailed > 0 && <span className="font-black text-red-dark">Email FAILED {m.emailFailed}</span>}
                  {m.emailPending > 0 && <span className="font-black text-red-dark">Email not confirmed {m.emailPending}</span>}
                  <span>Alerts {m.pushSent}</span>
                  <span>Read {m.read}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
