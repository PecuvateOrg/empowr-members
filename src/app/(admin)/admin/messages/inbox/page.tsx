// Admin -> Messages -> Inbox: what members sent through the contact form (newest first).
import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Inbox } from "lucide-react";
import { TIMEZONE } from "@/lib/business-rules";
import { listContactMessages, type ContactStatus } from "@/lib/contact-inbox";
import { MessagesTabs } from "@/components/admin/MessagesTabs";
import { StaffAlertsToggle } from "@/components/admin/StaffAlertsToggle";

export const metadata: Metadata = { title: "Inbox — Members Admin" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ContactStatus, string> = { open: "Open", replied: "Replied", closed: "Closed" };

export default async function AdminInboxPage() {
  const messages = await listContactMessages(100);
  const unread = messages.filter((m) => !m.read_at).length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <MessagesTabs active="inbox" unread={unread} />
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Inbox</h1>
        <p className="mt-1 text-mid">
          Messages from the Members contact form. A copy also goes to the CRM. Reply here and it reaches the
          family in their account and by email.
        </p>
      </div>

      <StaffAlertsToggle />

      {messages.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <Inbox className="mx-auto h-8 w-8 text-blue" aria-hidden />
          <p className="mt-3 font-extrabold text-black">No messages yet</p>
          <p className="mt-1 text-sm text-mid">When a member uses the contact form, it appears here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {messages.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/messages/inbox/${m.id}`} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-warm-white">
                <div className="min-w-0">
                  <p className={`truncate text-black ${m.read_at ? "font-semibold" : "font-black"}`}>
                    {!m.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue align-middle" aria-label="Unread" />}
                    {m.name} · {m.topic}
                  </p>
                  <p className="truncate text-sm text-mid">{m.body}</p>
                </div>
                <div className="shrink-0 text-right text-xs font-bold text-mid">
                  <p>{formatInTimeZone(m.created_at, TIMEZONE, "d MMM, h:mmaaa")}</p>
                  <p className={m.status === "open" ? "text-blue" : ""}>{STATUS_LABEL[m.status]}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
