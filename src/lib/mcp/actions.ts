// The agent action log (mem_agent_actions, ops/sql/members-agent-actions.sql). Every preview and send
// made through /api/mcp is written here, and a preview row doubles as the token its send must quote.
import "server-only";
import { createHash } from "node:crypto";
import type { McpCaller } from "@/lib/mcp/auth";
import { createServiceClient } from "@/lib/supabase/service";

export const PREVIEW_TTL_MINUTES = 10;
/** Per person, through AI tools. The screens have no such cap; an agent in a loop is the reason. */
export const SENDS_PER_HOUR = 5;
export const MAX_RECIPIENTS_PER_SEND = 300;
export const CREDITS_PER_HOUR = 10;
/** Larger credit is issued on the credit notes screen. */
export const MAX_CREDIT_PENCE = 20_000;

/** Binds a preview to exactly what was previewed, so a send cannot swap the text after the fact. */
export function messageFingerprint(m: { audience: { type: string; id: string }; subject: string; body: string; urgent: boolean }): string {
  return createHash("sha256")
    .update(JSON.stringify([m.audience.type, m.audience.id, m.subject, m.body, m.urgent]))
    .digest("hex");
}

export async function logAction(
  caller: McpCaller,
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
  ok: boolean
): Promise<string> {
  const { data, error } = await createServiceClient()
    .from("mem_agent_actions")
    .insert({
      user_id: caller.user.id,
      user_email: caller.user.email ?? "",
      role: caller.role,
      client_id: caller.clientId,
      tool,
      input,
      result: result ?? null,
      ok,
    })
    .select("id")
    .single();
  if (error) throw new Error(`agent action log failed: ${error.message}`);
  return data.id as string;
}

export type PreviewRecord = { input: Record<string, unknown>; result: Record<string, unknown> };

/** The caller's own successful preview (`tool` is the preview tool's name) with this id, if it is
 *  still fresh. */
export async function findPreview(caller: McpCaller, previewId: string, tool: string): Promise<PreviewRecord | null> {
  const since = new Date(Date.now() - PREVIEW_TTL_MINUTES * 60_000).toISOString();
  const { data, error } = await createServiceClient()
    .from("mem_agent_actions")
    .select("input, result")
    .eq("id", previewId)
    .eq("user_id", caller.user.id)
    .eq("tool", tool)
    .eq("ok", true)
    .gte("created_at", since)
    .maybeSingle();
  if (error) throw new Error(`preview read failed: ${error.message}`);
  if (!data || !data.result) return null;
  return { input: data.input as Record<string, unknown>, result: data.result as Record<string, unknown> };
}

/** Successful calls of `tool` by this person in the last hour, for the per-person caps. */
export async function actionsInLastHour(caller: McpCaller, tool: string): Promise<number> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await createServiceClient()
    .from("mem_agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", caller.user.id)
    .eq("tool", tool)
    .eq("ok", true)
    .gte("created_at", since);
  if (error) throw new Error(`action count read failed: ${error.message}`);
  return count ?? 0;
}

export type AgentAction = {
  id: string;
  createdAt: string;
  userEmail: string;
  role: string;
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  ok: boolean;
};

export async function listAgentActions(limit = 100): Promise<AgentAction[]> {
  const { data, error } = await createServiceClient()
    .from("mem_agent_actions")
    .select("id, created_at, user_email, role, tool, input, result, ok")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`agent actions read failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    createdAt: r.created_at as string,
    userEmail: r.user_email as string,
    role: r.role as string,
    tool: r.tool as string,
    input: r.input as Record<string, unknown>,
    result: r.result as Record<string, unknown> | null,
    ok: r.ok as boolean,
  }));
}
