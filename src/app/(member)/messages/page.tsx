import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { getAuthedAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/business-rules";

export const metadata: Metadata = { title: "Messages — Empowr Members" };
export const dynamic = "force-dynamic";

type Row = {
  message_id: string;
  read_at: string | null;
  created_at: string;
  message: { subject: string; body: string; urgent: boolean; sender_name: string; created_at: string } | null;
};

export default async function MessagesPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login?next=/messages");

  // The member's own RLS-scoped client: the database returns only their own messages. Columns are named
  // because the API roles are only granted the safe ones (select * is refused).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_message_recipients")
    .select("message_id, read_at, created_at, message:mem_messages(subject, body, urgent, sender_name, created_at)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("messages read failed", authed.account.id, error);
    throw new Error("messages_read_failed");
  }
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Messages</h1>
        <p className="mt-1 text-mid">Updates from Empowr CIC about sessions you have booked.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
          <Mail className="mx-auto h-10 w-10 text-blue" aria-hidden />
          <p className="mt-3 font-extrabold text-black">No messages yet</p>
          <p className="mt-1 text-sm text-mid">
            If we need to tell you something about a booking, like a change of time, it will appear here and in your email.
          </p>
          <Link href="/bookings" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-blue px-6 font-extrabold text-white hover:bg-blue-dark">
            See your bookings
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {rows.map((r) => {
            const unread = r.read_at === null;
            return (
              <li key={r.message_id}>
                <Link href={`/messages/${r.message_id}`} className="block px-5 py-4 transition-colors hover:bg-blue-pale/40">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`min-w-0 truncate text-black ${unread ? "font-black" : "font-semibold"}`}>
                      {unread && <span className="sr-only">Unread: </span>}
                      {r.message?.urgent && <span className="mr-2 rounded bg-red-soft px-2 py-0.5 text-xs font-black text-red-dark">URGENT</span>}
                      {r.message?.subject ?? "Message"}
                    </p>
                    <p className="shrink-0 text-xs font-semibold text-mid">
                      {formatInTimeZone(r.created_at, TIMEZONE, "d MMM")}
                    </p>
                  </div>
                  <p className={`mt-1 line-clamp-2 text-sm ${unread ? "font-bold text-black" : "text-mid"}`}>{r.message?.body}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
