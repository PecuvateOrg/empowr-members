import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { DASHBOARD_ORIGIN, SSO_APP, SSO_COOKIE_PATH, STATE_COOKIE } from "@/lib/sso";

// Starts "Sign in with Empowr Dashboard": a one-time state in an httpOnly cookie, then off to the Dashboard.
export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const url = new URL("/sso/authorize", DASHBOARD_ORIGIN);
  url.searchParams.set("app", SSO_APP);
  url.searchParams.set("state", state);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: "lax", path: SSO_COOKIE_PATH, maxAge: 600,
  });
  return response;
}
