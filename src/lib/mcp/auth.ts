// Who is calling the MCP endpoint (planning/spec/agent-access.md). An AI tool holds an access token
// issued by Supabase's OAuth 2.1 server to a person who approved it on /oauth/consent. The token is
// checked with Supabase on every call, then the person is put through the SAME allowlists as the
// screens: admin = ADMIN_EMAILS, coach = CHECKIN_EMAILS only. Anyone else gets nothing, so removing
// someone from a list removes their AI access on their next call.
import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail, isCheckinEmail } from "@/lib/admin";
import type { SenderRole } from "@/lib/message-core";
import { createServiceClient } from "@/lib/supabase/service";

export type McpCaller = { user: User; role: SenderRole; clientId: string | null };

/** The OAuth client the token was issued to (a claim Supabase adds), for the action log. Read only
 *  after Supabase has verified the token. */
function clientIdOf(token: string): string | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof claims.client_id === "string" ? claims.client_id : null;
  } catch {
    return null;
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/** "unauthenticated" = no or dead token (the client should sign in again); "forbidden" = a real
 *  Members account that is not on either staff list. */
export async function resolveMcpCaller(
  request: Request
): Promise<McpCaller | "unauthenticated" | "forbidden"> {
  const token = bearer(request);
  if (!token) return "unauthenticated";
  const { data, error } = await createServiceClient().auth.getUser(token);
  if (error || !data.user) return "unauthenticated";
  const user = data.user;
  const clientId = clientIdOf(token);
  if (isAdminEmail(user.email)) return { user, role: "admin", clientId };
  if (isCheckinEmail(user.email)) return { user, role: "coach", clientId };
  return "forbidden";
}

/** Where MCP clients discover how to sign in (RFC 9728), named in every 401. */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource`;
}
