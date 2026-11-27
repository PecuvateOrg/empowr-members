import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail, isCheckinEmail } from "@/lib/admin";
import { exchangeCode, MEMBERS_ORIGIN, sameString, sessionIdOf, SSO_COOKIE_PATH, STATE_COOKIE } from "@/lib/sso";
import { SSO_MARKER_COOKIE, SSO_MARKER_MAX_AGE, ssoMarker } from "@/lib/sso-marker";

// The Dashboard sends staff back here with a one-time code. Members checks the
// state it set, swaps the code server-to-server, and opens a session only if
// the email is on its own admin or door-team list. The session is an ordinary
// Supabase one (see lib/sso.ts), made on the server with an admin sign-in link
// that is used at once and never emailed. It never creates an account.
const NEW_ACCOUNT_MS = 2 * 60_000;

function finish(path: string, reason?: string) {
  const url = new URL(path, MEMBERS_ORIGIN);
  if (reason) url.searchParams.set("sso", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: STATE_COOKIE, path: SSO_COOKIE_PATH });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = request.headers.get("cookie")?.split(/;\s*/)
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1) ?? "";
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";

  if (!expected || !state || !sameString(state, expected)) return finish("/login", "expired");
  if (!code) return finish("/login", "failed");

  const who = await exchangeCode(code).catch(() => null);
  if (!who) return finish("/login", "failed");
  if (!isCheckinEmail(who.email)) {
    console.warn("[sso] dashboard sign-in refused: not on the Members staff lists");
    return finish("/login", "not_staff");
  }

  const service = createServiceClient();
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: who.email });
  if (linkError || !link?.user || !link.properties?.hashed_token) {
    console.error("[sso] could not make a sign-in link", linkError?.code ?? "no link");
    return finish("/login", "failed");
  }
  // An admin link for an unknown email makes an account. Staff must already
  // have one, so remove one made just now and refuse.
  if (Date.now() - Date.parse(link.user.created_at) < NEW_ACCOUNT_MS && !link.user.last_sign_in_at) {
    await service.auth.admin.deleteUser(link.user.id).catch(() => null);
    console.warn("[sso] dashboard sign-in refused: no Members account yet");
    return finish("/login", "no_account");
  }

  const supabase = await createClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  const sessionId = verified?.session ? sessionIdOf(verified.session.access_token) : undefined;
  if (verifyError || !sessionId) {
    console.error("[sso] could not open the session", verifyError?.code ?? "no session id");
    if (verified?.session) await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    return finish("/login", "failed");
  }

  const response = finish(isAdminEmail(who.email) ? "/admin" : "/checkin");
  response.cookies.set(SSO_MARKER_COOKIE, ssoMarker(sessionId), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SSO_MARKER_MAX_AGE,
  });
  console.log("[sso] signed in via dashboard");
  return response;
}
