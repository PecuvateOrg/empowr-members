import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { listAgentActions, type AgentAction } from "@/lib/mcp/actions";
import { TIMEZONE } from "@/lib/business-rules";

export const metadata: Metadata = { title: "AI tool activity — Members Admin" };
export const dynamic = "force-dynamic";

// Everything staff (and the workspace agent) did through an AI tool connected to /api/mcp: each
// preview, message send and credit issued, under the person who approved the connection. Reads are not logged.
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
  if (a.tool === "preview_credit" || a.tool === "issue_credit") {
    const r = a.result as { member?: string; what?: string; error?: string } | null;
    if (!a.ok) return `Credit failed: ${r?.error ?? "unknown error"}`;
    return `${a.tool === "preview_credit" ? "Previewed credit" : "Issued credit"} for ${r?.member ?? "a member"}: ${r?.what ?? ""}`;
  }
  if (a.tool === "set_skate_hire_stock") {
    const r = a.result as { changes?: { size: number; from: number | null; to: number }[]; error?: string } | null;
    if (!a.ok) return `Skate hire stock change failed: ${r?.error ?? "unknown error"}`;
    return `Skate hire stock: ${(r?.changes ?? []).map((c) => `UK ${c.size} ${c.from ?? "?"} → ${c.to}`).join(", ")}`;
  }
  if (a.tool === "add_date" || a.tool === "update_date") {
    const r = a.result as { when?: string; changes?: Record<string, unknown>; error?: string } | null;
    const verb = a.tool === "add_date" ? "Added date" : "Changed date";
    if (!a.ok) return `${verb} failed: ${r?.error ?? "unknown error"}`;
    const what = a.tool === "update_date" ? ` (${Object.keys(r?.changes ?? {}).join(", ").replaceAll("_", " ")})` : "";
    return `${verb} ${r?.when ?? ""}${what}`;
  }
  if (a.tool === "preview_cancel_session" || a.tool === "cancel_session") {
    const r = a.result as { session?: string; confirmed_bookings?: number; processed?: number; failed?: number; error?: string } | null;
    if (a.tool === "preview_cancel_session") return `Previewed cancelling ${r?.session ?? "a session"} (${r?.confirmed_bookings ?? 0} bookings)`;
    if (!a.ok) return `Cancelling ${r?.session ?? "a session"} failed: ${r?.error ?? "unknown error"}`;
    return `Cancelled ${r?.session ?? "a session"}: ${r?.processed ?? 0} bookings credited${r?.failed ? `, ${r.failed} FAILED` : ""}`;
  }
  if (a.tool === "block_private_slot" || a.tool === "unblock_private_slot") {
    const r = a.result as { when?: string | null; error?: string } | null;
    const verb = a.tool === "block_private_slot" ? "Blocked private slot" : "Lifted private slot block";
    return a.ok ? `${verb} ${r?.when ?? ""}` : `${verb} failed: ${r?.error ?? "unknown error"}`;
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
          Messages, credit, stock and session dates changed by staff through an AI tool connected to Members, newest first.
          Each change also shows on its own admin screen.
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
