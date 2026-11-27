// Admin allowlist — Pattern 2/3 hybrid per _config/guides/auth-middleware.md.
// Middleware only guards /admin with a session check (edge runtime, no DB);
// the allowlist check itself lives in the (admin) layout and here, for
// every /api/admin/* route.
import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SSO_MARKER_COOKIE, ssoSessionExpired } from "@/lib/sso-marker";
import type { User } from "@supabase/supabase-js";

function allowedEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails(process.env.ADMIN_EMAILS).includes(email.toLowerCase());
}

export function isCheckinEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (
    isAdminEmail(email) ||
    allowedEmails(process.env.CHECKIN_EMAILS).includes(email.toLowerCase())
  );
}

/** A session opened by "Sign in with Empowr Dashboard" ends after 12 hours
 *  (lib/sso.ts). The middleware signs it out on page views; API routes do not
 *  pass through the middleware, so the helpers below check it too. */
async function ssoSessionEnded(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const marker = (await cookies()).get(SSO_MARKER_COOKIE)?.value;
  if (!marker) return false;
  const { data } = await supabase.auth.getClaims();
  return ssoSessionExpired(marker, data?.claims?.session_id as string | undefined);
}

/** Resolve the signed-in user if they're on the admin allowlist, or null.
 *  Every /api/admin/* route must check this before touching the service
 *  client — RLS doesn't gate admin writes, this is the only gate. */
export async function getAuthedAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email) || (await ssoSessionEnded(supabase))) return null;
  return user;
}

/** Resolve a signed-in door team member or administrator. */
export async function getAuthedCheckinStaff(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isCheckinEmail(user.email) || (await ssoSessionEnded(supabase))) return null;
  return user;
}
