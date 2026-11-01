// OAuth protected-resource metadata (RFC 9728) for /api/mcp: tells an MCP client that tokens come
// from this project's Supabase Auth, which serves the sign-in, token and client-registration endpoints.
import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";

export function GET(request: Request) {
  return NextResponse.json({
    resource: `${requestOrigin(request)}/api/mcp`,
    authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "Empowr Members staff tools",
  });
}
