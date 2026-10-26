// Proves the ROLE GATE on the messaging routes, end to end through the real route handlers, the real
// getMessageSender() and the real send pipeline - only the session, the database client and the outbound
// transports are faked. Spec: planning/spec/member-messaging.md ("Who can send", "Sender name and replies").
//
// The assertions that matter most are the NEGATIVE ones: a coach asking for an offering, an account, or a
// session more than a week away must be refused BEFORE any recipient is read, and nothing may be sent.
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Staff = { id: string; email: string } | null;
let staff: Staff = null;
let adminEmails: string[] = [];
let accountName: string | null = "Sam Jones";
const occurrences = new Map<string, { starts_at: string; ends_at: string; offering: { title: string } }>();
let audienceRows: { account_id: string; account_name: string; participant_names: string[] }[] = [];
let rpcCalls: string[] = [];
let sent: { message: Record<string, unknown>; emailCount: number }[] = [];

mock.module("server-only", { namedExports: {} });
mock.module("next/server", {
  namedExports: { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
});
mock.module("@/lib/admin", {
  namedExports: {
    getAuthedCheckinStaff: async () => staff,
    getAuthedAdmin: async () => (staff && adminEmails.includes(staff.email) ? staff : null),
    isAdminEmail: (email: string | null | undefined) => Boolean(email) && adminEmails.includes(String(email)),
  },
});
mock.module("@/lib/supabase/service", {
  namedExports: {
    createServiceClient: () => ({
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: audienceRows, error: null };
      },
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          maybeSingle: async () => {
            if (table === "mem_accounts" && "user_id" in filters) {
              return { data: accountName === null ? null : { name: accountName }, error: null };
            }
            if (table === "mem_accounts") return { data: { id: filters.id }, error: null };
            if (table === "mem_occurrences") return { data: occurrences.get(String(filters.id)) ?? null, error: null };
            if (table === "mem_offerings") return { data: { title: "Roller Quad Camp" }, error: null };
            throw new Error(`unexpected read of ${table}`);
          },
        };
        return builder;
      },
    }),
  },
});
// The real sendMessage runs; only its database/transport dependencies are replaced.
mock.module("@/lib/message-store", {
  namedExports: {
    createSendDeps: () => {
      let current: Record<string, unknown> = {};
      return {
        store: {
          insertMessage: async (m: Record<string, unknown>) => {
            current = m;
            return { duplicate: false };
          },
          insertRecipients: async () => {},
          accountEmails: async (ids: string[]) => new Map(ids.map((id) => [id, `${id}@example.test`])),
          recordEmail: async () => {},
          subscriptions: async () => [],
          deleteSubscriptions: async () => {},
          recordPush: async () => {},
        },
        sendBatch: async (items: unknown[]) => {
          sent.push({ message: current, emailCount: items.length });
          return items.map((_, i) => ({ id: `e${i}` }));
        },
        sendPush: async () => "disabled",
      };
    },
  },
});

const sendRoute = await import("@/app/api/admin/messages/route");
const previewRoute = await import("@/app/api/admin/messages/preview/route");

const OCC = "11111111-1111-4111-8111-111111111111";
const OFFERING = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const REQ = "44444444-4444-4444-8444-444444444444";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const post = (route: { POST: (r: Request) => Promise<Response> }, body: unknown) =>
  route.POST(new Request("http://t/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const sendBody = (audience: { type: string; id: string }, over: Record<string, unknown> = {}) => ({
  audience, subject: "Late start", body: "We start at 4.30.", urgent: false, request_id: REQ, expected_count: 2, ...over,
});

beforeEach(() => {
  staff = { id: "coach-user", email: "coach@empowrcic.org" };
  adminEmails = ["admin@empowrcic.org"];
  accountName = "Sam Jones";
  occurrences.clear();
  occurrences.set(OCC, { starts_at: inDays(1), ends_at: inDays(1), offering: { title: "Skate Jam" } });
  audienceRows = [
    { account_id: "a1", account_name: "Parent One", participant_names: ["Kid A"] },
    { account_id: "a2", account_name: "Parent Two", participant_names: ["Kid B", "Kid C"] },
  ];
  rpcCalls = [];
  sent = [];
});

test("signed out (or not on a staff list): 401 and nothing read", async () => {
  staff = null;
  assert.equal((await post(previewRoute, { audience: { type: "occurrence", id: OCC } })).status, 401);
  assert.equal((await post(sendRoute, sendBody({ type: "occurrence", id: OCC }))).status, 401);
  assert.equal(rpcCalls.length, 0);
  assert.equal(sent.length, 0);
});

test("coach cannot reach an OFFERING audience: 403, no recipients read, nothing sent", async () => {
  for (const route of [previewRoute, sendRoute]) {
    const body = route === previewRoute ? { audience: { type: "offering", id: OFFERING } } : sendBody({ type: "offering", id: OFFERING });
    assert.equal((await post(route, body)).status, 403);
  }
  assert.equal(rpcCalls.length, 0, "the gate runs before any recipient is resolved");
  assert.equal(sent.length, 0);
});

test("coach cannot reach an ACCOUNT audience: 403, no recipients read, nothing sent", async () => {
  assert.equal((await post(previewRoute, { audience: { type: "account", id: ACCOUNT } })).status, 403);
  assert.equal((await post(sendRoute, sendBody({ type: "account", id: ACCOUNT }, { expected_count: 1 }))).status, 403);
  assert.equal(rpcCalls.length, 0);
  assert.equal(sent.length, 0);
});

test("coach cannot reach a session more than 7 days out, or one already over yesterday: 403, nothing read or sent", async () => {
  for (const days of [9, -2]) {
    occurrences.set(OCC, { starts_at: inDays(days), ends_at: inDays(days), offering: { title: "Skate Jam" } });
    assert.equal((await post(previewRoute, { audience: { type: "occurrence", id: OCC } })).status, 403, `${days} days`);
    assert.equal((await post(sendRoute, sendBody({ type: "occurrence", id: OCC }))).status, 403, `${days} days`);
  }
  assert.equal(rpcCalls.length, 0);
  assert.equal(sent.length, 0);
});

test("coach CAN preview and send a session tomorrow, as '<first name> at Empowr CIC'", async () => {
  const preview = await (await post(previewRoute, { audience: { type: "occurrence", id: OCC } })).json();
  assert.equal(preview.summary, "2 families, 3 children");
  assert.equal(preview.sendingAs, "Sam");
  const res = await post(sendRoute, sendBody({ type: "occurrence", id: OCC }));
  assert.equal(res.status, 201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].emailCount, 2);
  assert.equal(sent[0].message.senderRole, "coach");
  assert.equal(sent[0].message.senderName, "Sam");
  assert.equal(sent[0].message.from, '"Sam at Empowr CIC" <bookings@empowrcic.org>');
});

test("the sender identity is decided server-side: a name supplied in the request is ignored", async () => {
  const res = await post(sendRoute, { ...sendBody({ type: "occurrence", id: OCC }), sender_name: "Evil", sender_role: "admin", from: "x@evil.test" });
  assert.equal(res.status, 201);
  assert.equal(sent[0].message.senderName, "Sam");
  assert.equal(sent[0].message.senderRole, "coach");
  assert.equal(sent[0].message.from, '"Sam at Empowr CIC" <bookings@empowrcic.org>');
});

test("a coach whose account has no name cannot send, and the preview says why", async () => {
  accountName = "   ";
  const preview = await (await post(previewRoute, { audience: { type: "occurrence", id: OCC } })).json();
  assert.match(preview.senderError, /no name/i);
  assert.equal((await post(sendRoute, sendBody({ type: "occurrence", id: OCC }))).status, 409);
  assert.equal(sent.length, 0);
});

test("an email on BOTH lists is an admin: sends as 'Empowr CIC' and may message an offering", async () => {
  staff = { id: "both", email: "admin@empowrcic.org" };
  const res = await post(sendRoute, sendBody({ type: "offering", id: OFFERING }));
  assert.equal(res.status, 201);
  assert.equal(sent[0].message.senderRole, "admin");
  assert.equal(sent[0].message.senderName, "Empowr CIC");
  assert.equal(sent[0].message.from, '"Empowr CIC" <bookings@empowrcic.org>');
});

test("admin may message one account and a session far in the future", async () => {
  staff = { id: "admin-user", email: "admin@empowrcic.org" };
  assert.equal((await post(sendRoute, sendBody({ type: "account", id: ACCOUNT }, { expected_count: 2 }))).status, 201);
  occurrences.set(OCC, { starts_at: inDays(60), ends_at: inDays(60), offering: { title: "Skate Jam" } });
  assert.equal((await post(sendRoute, sendBody({ type: "occurrence", id: OCC }, { request_id: "55555555-5555-4555-8555-555555555555" }))).status, 201);
});

test("if bookings changed since the preview, the send is refused with the fresh picture", async () => {
  const res = await post(sendRoute, sendBody({ type: "occurrence", id: OCC }, { expected_count: 5 }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).count, 2);
  assert.equal(sent.length, 0);
});

test("nobody booked: 422, nothing sent", async () => {
  audienceRows = [];
  assert.equal((await post(sendRoute, sendBody({ type: "occurrence", id: OCC }, { expected_count: 0 }))).status, 422);
  assert.equal(sent.length, 0);
});

test("bad input is refused: empty subject, multi-line subject, oversize body, missing request id", async () => {
  const aud = { type: "occurrence", id: OCC };
  for (const over of [
    { subject: "   " },
    { subject: "Hi\nBcc: x@evil.test" },
    { body: "x".repeat(2001) },
    { request_id: undefined },
  ]) {
    assert.equal((await post(sendRoute, sendBody(aud, over))).status, 400, JSON.stringify(over).slice(0, 40));
  }
  assert.equal(sent.length, 0);
});
