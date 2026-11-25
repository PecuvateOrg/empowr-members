// Per-person rate limit on MCP tool calls (MCP Framework core/5 rule 3; the MCP spec: servers MUST
// rate-limit). Counter + functions live in the database (migration 20261125120000_mcp_rate_limits,
// Empowr CIC/projects/supabase), so every Amplify instance shares one count.
// A call reserves its weight first and gives it back if it fails or is refused: only successful
// calls count (core/5 rule 4). Per-tool hourly caps in actions.ts still apply on top.
import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

const SERVER = "empowr-members";
export const PER_MINUTE = 60;
export const PER_DAY = 2000;

/** read = 1, any change = 2 (core/5 rule 5). */
export const weightOf = (kind: "read" | "write" | "destructive") => (kind === "read" ? 1 : 2);

/** null = allowed (and reserved); a string = the refusal to show the agent. */
export async function takeRate(sub: string, weight: number): Promise<string | null> {
  const { data, error } = await createServiceClient().rpc("mcp_rate_take", {
    p_server: SERVER, p_sub: sub, p_weight: weight, p_per_minute: PER_MINUTE, p_per_day: PER_DAY,
  });
  // Fail OPEN on purpose: a broken counter must not stop staff work. Logged so it is seen.
  if (error) { console.error("mcp rate limit unavailable, allowing call", error.message); return null; }
  const r = data as { ok: boolean; limit?: "minute" | "day"; retry_at?: string };
  if (r.ok) return null;
  const cap = r.limit === "day" ? `${PER_DAY} per day` : `${PER_MINUTE} per minute`;
  return `Rate limit reached (${cap}, reads count 1, changes 2). It resets at ${r.retry_at}. Wait until then, or use the admin screen.`;
}

export async function giveBack(sub: string, weight: number): Promise<void> {
  const { error } = await createServiceClient().rpc("mcp_rate_give_back", { p_server: SERVER, p_sub: sub, p_weight: weight });
  if (error) console.error("mcp rate give-back failed", error.message);
}
