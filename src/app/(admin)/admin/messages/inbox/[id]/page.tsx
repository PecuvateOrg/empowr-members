// One contact-form message: who sent it, the account and skaters it is linked to, and the reply form.
// Opening it marks it read.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/business-rules";
import { getContactMessage, updateContactMessage } from "@/lib/contact-inbox";
import { createServiceClient } from "@/lib/supabase/service";
import { InboxReply } from "@/components/admin/InboxReply";

export const metadata: Metadata = { title: "Inbox message — Members Admin" };
export const dynamic = "force-dynamic";

async function linkedAccount(accountId: string | null) {
  if (!accountId) return null;
  const service = createServiceClient();
  const [account, participants] = await Promise.all([
    service.from("mem_accounts").select("name").eq("id", accountId).maybeSingle(),
    service.from("mem_participants").select("name").eq("account_id", accountId).order("name"),
  ]);
  if (account.error) throw new Error(`account read failed: ${account.error.message}`);
  if (participants.error) throw new Error(`participants read failed: ${participants.error.message}`);
  return {
    name: (account.data?.name as string | undefined) ?? "Unknown",
    skaters: ((participants.data ?? []) as { name: string }[]).map((p) => p.name).filter((n) => n !== "Deleted skater"),
  };
}

export default async function InboxMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const m = await getContactMessage(id);
  if (!m) notFound();
  if (!m.read_at) await updateContactMessage(id, { read_at: new Date().toISOString() });
  const account = await linkedAccount(m.account_id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/admin/messages/inbox" className="text-sm font-bold text-mid underline underline-offset-2 hover:text-blue">
        All inbox messages
      </Link>

      <section className="rounded-2xl border border-line bg-card p-6">
        <p className="text-xs font-black uppercase tracking-wide text-mid">{m.topic}</p>
        <h1 className="mt-1 text-2xl font-black text-black">{m.name}</h1>
        <p className="text-sm text-mid">
          <a href={`mailto:${m.email}`} className="font-bold text-blue underline">
            {m.email}
          </a>{" "}
          · {formatInTimeZone(m.created_at, TIMEZONE, "EEE d MMM yyyy, h:mmaaa")}
        </p>
        <p className="mt-2 text-sm text-mid">
          {account ? (
            <>
              Signed in as <span className="font-bold text-black">{account.name}</span>
              {account.skaters.length > 0 && <> · skaters: {account.skaters.join(", ")}</>}
            </>
          ) : (
            "Not signed in, so not linked to an account. Your reply goes by email only."
          )}
        </p>
        <div className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-black">{m.body}</div>
      </section>

      {m.status === "replied" && m.replied_at && (
        <p className="rounded-xl bg-blue-light/20 px-4 py-3 text-sm font-bold text-black">
          Replied {formatInTimeZone(m.replied_at, TIMEZONE, "EEE d MMM, h:mmaaa")}
          {m.reply_message_id && (
            <>
              {" "}
              ·{" "}
              <Link href={`/admin/messages/${m.reply_message_id}`} className="text-blue underline">
                see the reply
              </Link>
            </>
          )}
        </p>
      )}

      <InboxReply id={m.id} topic={m.topic} status={m.status} linked={Boolean(account)} />
    </main>
  );
}
