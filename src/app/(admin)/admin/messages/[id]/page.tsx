import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { getSentMessage } from "@/lib/message-log";
import { TIMEZONE } from "@/lib/business-rules";

export const metadata: Metadata = { title: "Message — Members Admin" };
export const dynamic = "force-dynamic";

export default async function SentMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const m = await getSentMessage(id);
  if (!m) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/admin/messages" className="text-sm font-bold text-mid underline underline-offset-2 hover:text-blue">
          Back to messages
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-black">
          {m.urgent ? "URGENT: " : ""}
          {m.subject}
        </h1>
        <p className="mt-1 text-sm font-semibold text-mid">
          {m.senderName}
          {m.senderRole === "coach" ? " (coach)" : ""} · {formatInTimeZone(m.createdAt, TIMEZONE, "EEE d MMM yyyy, h:mmaaa")}
          {m.audienceLabel ? ` · ${m.audienceLabel}` : ""}
        </p>
      </div>

      <section className="rounded-2xl bg-card p-6 shadow-sm">
        <p className="whitespace-pre-wrap text-black">{m.body}</p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Recipients", m.recipients, false],
          ["Email sent", m.emailSent, false],
          ["Email failed", m.emailFailed + m.emailPending, m.emailFailed + m.emailPending > 0],
          ["Read", m.read, false],
        ].map(([label, value, bad]) => (
          <div key={String(label)} className={`rounded-2xl p-4 ${bad ? "bg-red-soft" : "bg-card"} shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-wide text-mid">{label}</p>
            <p className={`text-2xl font-black ${bad ? "text-red-dark" : "text-black"}`}>{value}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-extrabold text-black">Who got it</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-line text-xs font-bold uppercase tracking-wide text-mid">
              <tr>
                <th className="px-4 py-3">Family</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Alerts</th>
                <th className="px-4 py-3">Read</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {m.recipientRows.map((r) => (
                <tr key={r.accountId}>
                  <td className="px-4 py-3">
                    <p className="font-extrabold text-black">{r.name}</p>
                    {r.participantNames.length > 0 && <p className="text-mid">{r.participantNames.join(", ")}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {r.emailStatus === "sent" ? (
                      "Sent"
                    ) : (
                      <span className="font-black text-red-dark">
                        {r.emailStatus === "failed" ? "FAILED" : "Not confirmed"}
                        {r.emailError && <span className="block text-xs font-semibold">{r.emailError}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.pushSent > 0 ? `${r.pushSent} ${r.pushSent === 1 ? "device" : "devices"}` : "None"}</td>
                  <td className="px-4 py-3">{r.readAt ? formatInTimeZone(r.readAt, TIMEZONE, "d MMM, h:mmaaa") : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
