// Remote MCP endpoint for staff AI tools (planning/spec/agent-access.md). Stateless Streamable HTTP:
// every POST carries one JSON-RPC message and gets one JSON reply, so no session store is needed on
// Amplify. Sign-in is Supabase's OAuth 2.1 server; lib/mcp/auth.ts decides who the caller is.
import { NextResponse } from "next/server";
import { resolveMcpCaller, resourceMetadataUrl } from "@/lib/mcp/auth";
import { TOOLS, ToolRefusal, toolsFor } from "@/lib/mcp/tools";
import { requestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const reply = (id: RpcRequest["id"], result: unknown) => NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const toolText = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  isError,
});

export async function POST(request: Request) {
  const caller = await resolveMcpCaller(request);
  if (caller === "unauthenticated") {
    return new NextResponse(null, {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(requestOrigin(request))}"` },
    });
  }
  if (caller === "forbidden") {
    return NextResponse.json({ error: "This Members account is not on the staff list." }, { status: 403 });
  }

  let message: RpcRequest;
  try {
    message = await request.json();
  } catch {
    return fail(null, -32700, "Parse error");
  }
  if (Array.isArray(message) || message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return fail(null, -32600, "Invalid request");
  }
  // Notifications (no id) need no answer.
  if (message.id === undefined) return new NextResponse(null, { status: 202 });

  switch (message.method) {
    case "initialize": {
      const asked = message.params?.protocolVersion;
      return reply(message.id, {
        protocolVersion: typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "empowr-members", version: "1.0.0" },
        instructions: `Empowr Members staff tools. You are acting as ${caller.user.email} (${caller.role}).`,
      });
    }
    case "ping":
      return reply(message.id, {});
    case "tools/list":
      return reply(message.id, { tools: toolsFor(caller.role) });
    case "tools/call": {
      const name = message.params?.name;
      const tool = typeof name === "string" ? TOOLS[name] : undefined;
      if (!tool || !tool.roles.includes(caller.role)) return fail(message.id, -32602, `Unknown tool: ${String(name)}`);
      const args = tool.input.safeParse(message.params?.arguments ?? {});
      if (!args.success) return reply(message.id, toolText(`Invalid arguments: ${args.error.message}`, true));
      try {
        return reply(message.id, toolText(await tool.run(args.data as never, caller)));
      } catch (err) {
        if (err instanceof ToolRefusal) return reply(message.id, toolText(err.message, true));
        console.error("mcp tool failed", name, caller.user.id, err);
        return reply(message.id, toolText("That did not work. Try again, or use the admin screen.", true));
      }
    }
    default:
      return fail(message.id, -32601, `Method not found: ${message.method}`);
  }
}

// No server-initiated stream in a stateless server.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
