// Session refresh + route guards — Pattern 1 (session guard) per
// _config/guides/auth-middleware.md. Public catalogue stays open;
// (member) routes need a session; (admin) allowlist check lives in the
// admin layout (needs no DB, but keeps middleware thin and testable).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeAppPath } from "@/lib/safe-path";
import { PARTY_INVITE_COOKIE, partyInviteToken } from "@/lib/party-invite";

const MEMBER_PREFIXES = ["/account", "/basket", "/bookings", "/book", "/membership", "/messages"];
const ADMIN_PREFIX = "/admin";
const CHECKIN_PREFIX = "/checkin";
// AI-tool consent (app/oauth/consent). Its query string carries the request id, so the login
// redirect keeps it.
const OAUTH_PREFIX = "/oauth";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // The signed-out landing pages. "/" belongs here with /login and /signup:
  // its only calls to action are "Sign in" and "Create an account", so a
  // signed-in member who taps the header logo — which points at "/" — lands
  // on a page inviting them to do the one thing they have already done.
  // Handling it here rather than by making the logo's href depend on the
  // session fixes every route in: the logo, a bookmark, or typing the bare
  // domain. The header itself stays statically rendered, which is the
  // constraint AuthNavAction documents.
  const isAuthPage =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup");
  const needsSession =
    MEMBER_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path === ADMIN_PREFIX ||
    path.startsWith(`${ADMIN_PREFIX}/`) ||
    path === CHECKIN_PREFIX ||
    path.startsWith(`${CHECKIN_PREFIX}/`) ||
    path.startsWith(`${OAUTH_PREFIX}/`);

  // Nothing on this route depends on who is asking, so skip the auth
  // round trip entirely rather than building a client to throw the answer
  // away. supabase.auth.getUser() is a real network call to /auth/v1/user
  // whenever a session cookie is present, and this runs on every public
  // page view — the catalogue was paying for a user it never read.
  //
  // The cost of skipping is that a signed-in member browsing only public
  // pages does not get their access token refreshed here. That is safe:
  // the refresh token outlives the access token by weeks, the browser
  // client refreshes on its own, and the first member or auth route they
  // touch runs the full path below.
  if (!needsSession && !isAuthPage) {
    const response = NextResponse.next({ request });
    // Remember the last party invitation opened in this browser, so /account
    // can offer the way back if sign-in or adding a skater strands someone
    // there (issue #194). Only the token is kept; the page still checks it.
    const invite = partyInviteToken(path);
    if (invite) {
      response.cookies.set(PARTY_INVITE_COOKIE, invite, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && needsSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path.startsWith(`${OAUTH_PREFIX}/`) ? path + request.nextUrl.search : path);
    if (path.startsWith(`${OAUTH_PREFIX}/`)) url.searchParams.delete("authorization_id");
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    // A signed-in member sent to /login?next=… (a stale sign-in tab, the back
    // button, or a page that bounced them) goes on to that page. Dropping
    // `next` here sent party guests to /account with no way back to the
    // invitation (issue #194).
    // An ?error= still lands on /account below, where it is shown.
    const next =
      path === "/" || request.nextUrl.searchParams.has("error")
        ? null
        : safeAppPath(request.nextUrl.searchParams.get("next"));
    if (next && !next.startsWith("/login") && !next.startsWith("/signup")) {
      const target = new URL(next, "http://x");
      url.pathname = target.pathname;
      url.search = target.search;
      return NextResponse.redirect(url);
    }
    url.pathname = "/account";
    // Carry an auth error across rather than dropping it. The auth completion
    // routes report a dead link by redirecting to /login?error=..., and this
    // redirect used to wipe the query string — so a signed-in member who
    // followed an expired or already-used password-reset link landed on
    // their own account with NO message at all. That reads as success: they
    // believe the password changed when it did not. Reported 2026-08-31.
    const error = request.nextUrl.searchParams.get("error");
    url.search = error ? `?error=${encodeURIComponent(error)}` : "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
