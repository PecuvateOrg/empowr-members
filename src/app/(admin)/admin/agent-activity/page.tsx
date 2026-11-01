import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { listAgentActions, type AgentAction } from "@/lib/mcp/actions";
import { TIMEZONE } from "@/lib/business-rules";

export const metadata: Metadata = { title: "AI tool activity — Members Admin" };
export const dynamic = "force-dynamic";

// Everything staff (and the workspace agent) did through an AI tool connected to /api/mcp: each
// message preview and each send, under the person who approved the connection. Reads are not logged.
function describe(a: AgentAction): string {
  if (a.tool === "preview_message") {
    const r = a.result as { label?: string; summary?: string } | null;
    return `Previewed "${String(a.input.subject ?? "")}" to ${r?.label || r?.summary || "one member"}`;
  }
  if (a.tool === "send_message") {
    const r = a.result as { recipients?: number; emailSent?: number; duplicate?: boolean; error?: string } | null;
    if (!a.ok) return `Send failed: ${r?.error ?? "unknown error"}`;
    if (r?.duplicate) return "Send repeated: already sent, nothing sent again";
    return `Sent to ${r?.recipients ?? 0} families (email sent ${r?.emailSent ?? 0})`;
  }
  return a.tool;
}

export default async function AgentActivityPage() {
  const actions = await listAgentActions(100);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">AI tool activity</h1>
        <p className="mt-1 text-mid">
          Messages previewed and sent by staff through an AI tool connected to Members, newest first. The messages
          themselves also appear under Messages.
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="font-extrabold text-black">Nothing yet</p>
          <p className="mt-1 text-sm text-mid">When someone sends a message through an AI tool, it shows here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {actions.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={`font-extrabold ${a.ok ? "text-black" : "text-red-dark"}`}>{describe(a)}</p>
                <p className="text-xs font-semibold text-mid">
                  {formatInTimeZone(a.createdAt, TIMEZONE, "EEE d MMM yyyy, h:mmaaa")}
                </p>
              </div>
              <p className="mt-1 text-sm text-mid">
                {a.userEmail} ({a.role})
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
