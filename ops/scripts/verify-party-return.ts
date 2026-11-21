/**
 * verify-party-return.ts
 *
 * Run:  npm run verify:party-return     (from src/)
 *
 * Regression cover for issue #194: party guests who added children and signed
 * waivers were missing from the party register, and the organiser reported
 * that the party link "opened the account page".
 *
 * The tripping cases are the ones that FAILED before the fix:
 *   - a signed-in member sent to /login?next=<party link> was redirected to
 *     /account and the party link was thrown away;
 *   - an incomplete email link dropped `next` from its /login?error= redirect;
 *   - nothing remembered which invitation the browser had opened, so /account
 *     could not offer the way back.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

mock.module("server-only", { namedExports: {} });

let currentUser: { id: string } | null = null;
mock.module("@supabase/ssr", {
  namedExports: {
    createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: currentUser } }) },
    }),
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "anon";

const { NextRequest } = await import("next/server");
const { middleware } = await import("@/middleware");
const { safeAppPath } = await import("@/lib/safe-path");
const { partyInviteToken, PARTY_INVITE_COOKIE } = await import("@/lib/party-invite");

const ORIGIN = "https://members.empowrcic.org";
const TOKEN = "a".repeat(64);
const PARTY = `/private-bookings/join/${TOKEN}`;

function req(path: string) {
  return new NextRequest(new URL(path, ORIGIN));
}
function location(res: Response) {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
}

test("signed-in member on /login?next=<party> goes on to the party (#194)", async () => {
  currentUser = { id: "u1" };
  const res = await middleware(req(`/login?next=${encodeURIComponent(PARTY)}`));
  assert.equal(location(res), PARTY);
});

test("signed-in member on /signup?next=<party> goes on to the party", async () => {
  currentUser = { id: "u1" };
  const res = await middleware(req(`/signup?next=${encodeURIComponent(PARTY)}`));
  assert.equal(location(res), PARTY);
});

test("next keeps its own query string", async () => {
  currentUser = { id: "u1" };
  const res = await middleware(req(`/login?next=${encodeURIComponent("/book/abc?x=1")}`));
  assert.equal(location(res), "/book/abc?x=1");
});

test("an off-site next is refused and lands on /account", async () => {
  currentUser = { id: "u1" };
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "/login?next=/x"]) {
    const res = await middleware(req(`/login?next=${encodeURIComponent(bad)}`));
    assert.equal(location(res), "/account", bad);
  }
});

test("an auth error still lands on /account, where it is shown", async () => {
  currentUser = { id: "u1" };
  const res = await middleware(req(`/login?error=dead&next=${encodeURIComponent(PARTY)}`));
  assert.equal(location(res), "/account?error=dead");
});

test("signed-in member on bare /login still goes to /account", async () => {
  currentUser = { id: "u1" };
  assert.equal(location(await middleware(req("/login"))), "/account");
});

test("opening a party invitation remembers it for /account", async () => {
  currentUser = null;
  const res = await middleware(req(PARTY));
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`${PARTY_INVITE_COOKIE}=${TOKEN}`));
  assert.match(cookie, /HttpOnly/i);
});

test("other pages do not set the invitation cookie", async () => {
  currentUser = null;
  const res = await middleware(req("/sessions"));
  assert.equal(res.headers.get("set-cookie"), null);
});

test("partyInviteToken only accepts a real invite path", () => {
  assert.equal(partyInviteToken(PARTY), TOKEN);
  assert.equal(partyInviteToken(`${PARTY}/`), TOKEN);
  assert.equal(partyInviteToken("/private-bookings/join/short"), null);
  assert.equal(partyInviteToken(`/x${PARTY}`), null);
});

test("safeAppPath refuses protocol-relative paths", () => {
  assert.equal(safeAppPath("/account"), "/account");
  assert.equal(safeAppPath("//evil"), null);
  assert.equal(safeAppPath("/\\evil"), null);
  assert.equal(safeAppPath("evil"), null);
  assert.equal(safeAppPath(null), null);
});

test("an incomplete email link keeps next on its /login?error= redirect", async () => {
  const { GET } = await import("@/app/auth/confirm/start/route");
  const res = await GET(req(`/auth/confirm/start?next=${encodeURIComponent(PARTY)}`));
  const loc = new URL(res.headers.get("location")!);
  assert.equal(loc.pathname, "/login");
  assert.ok(loc.searchParams.get("error"));
  assert.equal(loc.searchParams.get("next"), PARTY);
});
