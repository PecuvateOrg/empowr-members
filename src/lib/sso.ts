import "server-only";
import { timingSafeEqual } from "crypto";

// "Sign in with Empowr Dashboard" (single sign-on) for the admin and door-team
// areas, as EFN and ECCP do (_config/guides/empowr-staff-single-sign-on.md).
// The Dashboard checks the person's staff domain and that an admin ticked
// Members for them on its Platform access page; Members then requires the email
// on its own admin or door-team list, so a person needs both.
//
// Members has no session table of its own: every page reads the Supabase
// session that members also use, and its lifetime is project-wide. So the
// callback opens an ordinary Supabase session and records its session id and a
// 12-hour end in a marker cookie (lib/sso-marker.ts). When that session passes
// its end, the middleware signs it out and the admin helpers refuse it.
// Sessions started any other way never carry a matching marker.

export const DASHBOARD_ORIGIN = "https://dashboard.empowrcic.org";
// Never build redirects from request.url: on Amplify it is the internal host.
export const MEMBERS_ORIGIN = "https://members.empowrcic.org";
export const SSO_APP = "members";
export const STATE_COOKIE = "members_sso_state";
export const SSO_COOKIE_PATH = "/api/auth/sso";

export function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The `session_id` claim of an access token Supabase has just issued to us (decode only). */
export function sessionIdOf(accessToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : undefined;
  } catch {
    return undefined;
  }
}

export type DashboardIdentity = { staffId: string; email: string; fullName: string };

/** Server-to-server code exchange. Null when the Dashboard refuses (or the secret is unset). */
export async function exchangeCode(code: string): Promise<DashboardIdentity | null> {
  const secret = process.env.DASHBOARD_SSO_SECRET;
  if (!secret) {
    console.error("[sso] DASHBOARD_SSO_SECRET is not set");
    return null;
  }
  const res = await fetch(`${DASHBOARD_ORIGIN}/api/sso/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ app: SSO_APP, code }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn("[sso] dashboard refused the code", res.status);
    return null;
  }
  const who = (await res.json()) as Partial<DashboardIdentity>;
  return typeof who.email === "string" && who.email
    ? { staffId: String(who.staffId), email: who.email, fullName: String(who.fullName ?? "") }
    : null;
}
