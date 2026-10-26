import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getAuthedAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE } from "@/lib/business-rules";
import { ADMIN_SENDER_NAME } from "@/lib/message-core";
import { MarkRead } from "@/components/messaging/MarkRead";

export const metadata: Metadata = { title: "Message — Empowr Members" };
export const dynamic = "force-dynamic";

type Row = {
  read_at: string | null;
  created_at: string;
  participant_names: string[];
  message: {
    subject: string;
    body: string;
    urgent: boolean;
    sender_name: string;
    sender_role: "admin" | "coach";
    audience_label: string;
  } | null;
};

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authed = await getAuthedAccount();
  if (!authed) redirect(`/login?next=/messages/${id}`);
  // Not a message id, or not one addressed to this account: both are "not found" so a guessed id learns nothing.
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mem_message_recipients")
    .select(
      "read_at, created_at, participant_names, message:mem_messages(subject, body, urgent, sender_name, sender_role, audience_label)"
    )
    .eq("message_id", id)
    .maybeSingle();
  if (error) {
    console.error("message read failed", id, error);
    throw new Error("message_read_failed");
  }
  const row = data as unknown as Row | null;
  if (!row?.message) notFound();
  const m = row.message;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <MarkRead messageId={id} alreadyRead={row.read_at !== null} />
      <Link href="/messages" className="text-sm font-bold text-mid underline underline-offset-2 hover:text-blue">
        All messages
      </Link>
      <article className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        {m.urgent && <p className="mb-2 inline-block rounded bg-red-soft px-2 py-0.5 text-xs font-black text-red-dark">URGENT</p>}
        <h1 className="text-2xl font-black tracking-tight text-black">{m.subject}</h1>
        <p className="mt-1 text-sm font-semibold text-mid">
          {formatInTimeZone(row.created_at, TIMEZONE, "EEE d MMM yyyy, h:mmaaa")}
        </p>
        <p className="mt-5 whitespace-pre-wrap text-black">{m.body}</p>
        <p className="mt-5 font-bold text-black">
          {m.sender_role === "coach" ? `${m.sender_name}, ${ADMIN_SENDER_NAME}` : ADMIN_SENDER_NAME}
        </p>
        {(m.audience_label || row.participant_names.length > 0) && (
          <dl className="mt-6 space-y-1 rounded-xl bg-blue-pale px-4 py-3 text-sm">
            {m.audience_label && (
              <div className="flex gap-3">
                <dt className="w-14 shrink-0 font-bold text-mid">About</dt>
                <dd className="font-semibold text-black">{m.audience_label}</dd>
              </div>
            )}
            {row.participant_names.length > 0 && (
              <div className="flex gap-3">
                <dt className="w-14 shrink-0 font-bold text-mid">For</dt>
                <dd className="font-semibold text-black">{row.participant_names.join(", ")}</dd>
              </div>
            )}
          </dl>
        )}
      </article>
      <p className="text-sm text-mid">
        Replies to the email reach our team at bookings@empowrcic.org. You cannot reply here yet.
      </p>
    </main>
  );
}
